const mongoose = require("mongoose");
const Order = require("../models/Order");
const Product = require("../models/Product");
const AppError = require("../utils/AppError");
const Inventory = require("./Inventory.Service");
const Audit = require("./Audit.Service");
const escapeRegExp = require("../utils/escapeRegExp");
const Plans = require("./Plan.Service");
const Cache = require("./Cache.Service");
const Webhooks = require("./Webhook.Service");
const Notifications = require("./Notification.Service");

const createOrder = async (data, organization, context) => {
    const { products, userInfo } = data;
    if (!Array.isArray(products) || products.length === 0) throw new AppError("Any Product selected", 400);
    if (!userInfo) throw new AppError("Please Complete your Form ", 400);

    for (const item of products) {
        if (!item || !mongoose.isValidObjectId(item.product)) throw new AppError("Invalid product ID", 400);
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
            throw new AppError("Quantity must be a positive integer", 400);
        }
    }
    const productIds = [...new Set(products.map((item) => item.product.toString()))];
    const orderLines = new Set(products.map((item) => `${item.product}:${item.variantSku || ""}`));
    if (orderLines.size !== products.length) throw new AppError("Duplicate product/variant lines are not allowed", 400);

    const foundProducts = await Product.find({ organization, _id: { $in: productIds }, deletedAt: null });
    if (foundProducts.length !== productIds.length) {
        throw new AppError("One or more products were not found", 404, "PRODUCT_NOT_FOUND");
    }
    const productById = new Map(foundProducts.map((product) => [product._id.toString(), product]));
    for (const item of products) {
        const product = productById.get(item.product.toString());
        const availableStock = item.variantSku
            ? product.variants.find((variant) => variant.sku === item.variantSku)?.stock
            : product.stock;
        if (availableStock === undefined) throw new AppError("Variant not found", 404, "VARIANT_NOT_FOUND");
        if (item.quantity > availableStock) throw new AppError(`Insufficient stock for ${product.name}`, 400);
    }
    const orderProducts = products.map((item) => {
        const product = productById.get(item.product.toString());
        return { product: product._id, quantity: item.quantity, price: product.price, costPrice: product.costPrice, variantSku: item.variantSku || null };
    });
    const totalPrice = orderProducts.reduce((sum, item) => sum + item.price * item.quantity, 0);

    const session = await mongoose.startSession();
    try {
        const created = await session.withTransaction(async () => {
            await Plans.consumeOrderUsage(organization, session);
            for (const item of orderProducts) {
                await Inventory.StockOut({ quantity: item.quantity, variantSku: item.variantSku }, item.product, organization, session, context);
            }
            const [order] = await Order.create([{
                organization, products: orderProducts, userInfo, totalPrice, status: "pending"
            }], { session });
            await Audit.record({
                organization, ...context, action: "order.create", entity: "order",
                entityId: order._id, after: order
            }, session);
            return order;
        });
        await Cache.invalidateOrganization(organization);
        await Webhooks.dispatch(organization, "order.created", created);
        return created;
    } finally {
        await session.endSession();
    }
};

const getAllOrder = async (organization, querySearch, queryStatus, queryPage, queryLimit, querySort) => {
    const page = Number(queryPage ?? 1);
    const limit = Number(queryLimit ?? 12);
    if (!Number.isInteger(page) || page < 1) throw new AppError("the page number should be positive", 400);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new AppError("the limit must be between 1 and 100", 400);
    }
    const filter = { organization, deletedAt: null };
    if (querySearch) {
        const safeSearch = escapeRegExp(querySearch);
        filter.$or = [
            { "userInfo.name": { $regex: safeSearch, $options: "i" } },
            { "userInfo.city": { $regex: safeSearch, $options: "i" } }
        ];
    }
    if (queryStatus) filter.status = queryStatus;
    const sortField = ["totalPrice", "createdAt"].includes(querySort) ? querySort : "createdAt";
    const [orders, total] = await Promise.all([
        Order.find(filter).sort({ [sortField]: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        Order.countDocuments(filter)
    ]);
    if (orders.length === 0) throw new AppError("find 0 order", 404);
    return { orders, pagnition: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

const getOrderById = async (organization, orderId) => {
    if (!mongoose.isValidObjectId(orderId)) throw new AppError("Invalid order ID", 400);
    const order = await Order.findOne({ _id: orderId, organization, deletedAt: null }).lean();
    if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    return order;
};

const updateOrderStatus = async (orderId, organization, data, context) => {
    const { status } = data;
    const transitions = { pending: ["confirmed"], confirmed: ["shipped"], shipped: ["delivered"], delivered: [], cancelled: [] };
    if (!Object.hasOwn(transitions, status)) throw new AppError("Invalid order status", 400);
    const order = await Order.findOne({ _id: orderId, organization });
    if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    if (!transitions[order.status].includes(status)) {
        throw new AppError(`Cannot change order status from ${order.status} to ${status}`, 409);
    }
    const before = order.toObject();
    const updated = await Order.findOneAndUpdate({
        _id: orderId, organization, status: order.status
    }, { $set: { status } }, { new: true, runValidators: true });
    if (!updated) throw new AppError("Order status changed; please retry", 409);
    await Audit.record({
        organization, ...context, action: "order.status.update", entity: "order",
        entityId: order._id, before, after: updated
    });
    await Cache.invalidateOrganization(organization);
    await Notifications.orderStatus(updated, status);
    return { message: "the status has been updated", findOrderAndUpdateStatus: updated };
};

const CancelOrder = async (orderId, organization, context) => {
    const order = await Order.findOne({ _id: orderId, organization });
    if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    if (order.status === "cancelled") throw new AppError("Order is already cancelled", 400);
    if (["shipped", "delivered"].includes(order.status)) {
        throw new AppError("Cannot cancel an order that has already shipped", 400);
    }
    if (!["pending", "confirmed"].includes(order.status)) throw new AppError("Order cannot be cancelled", 400);

    const session = await mongoose.startSession();
    try {
        const result = await session.withTransaction(async () => {
            for (const item of order.products) {
                await Inventory.StockIn({ quantity: item.quantity, variantSku: item.variantSku }, item.product, organization, session, context);
            }
            const updated = await Order.findOneAndUpdate({
                _id: orderId, organization, status: order.status
            }, { $set: { status: "cancelled" } }, { new: true, runValidators: true, session });
            if (!updated) throw new AppError("Order status changed; please retry", 409);
            await Audit.record({
                organization, ...context, action: "order.cancel", entity: "order",
                entityId: updated._id, before: order, after: updated
            }, session);
            return { message: "the order has been cancelled", CancelOrder: updated };
        });
        await Cache.invalidateOrganization(organization);
        return result;
    } finally {
        await session.endSession();
    }
};

const deleteOrder = async (orderId, organization, context) => {
    const order = await Order.findOne({ _id: orderId, organization, deletedAt: null });
    if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    const before = order.toObject();
    order.deletedAt = new Date();
    await order.save();
    await Audit.record({ organization, ...context, action: "order.delete", entity: "order", entityId: order._id, before, after: order });
    await Cache.invalidateOrganization(organization);
    return order;
};
const restoreOrder = async (orderId, organization, context) => {
    const order = await Order.findOne({ _id: orderId, organization, deletedAt: { $ne: null } });
    if (!order) throw new AppError("Deleted order not found", 404, "ORDER_NOT_FOUND");
    const before = order.toObject();
    order.deletedAt = null;
    await order.save();
    await Audit.record({ organization, ...context, action: "order.restore", entity: "order", entityId: order._id, before, after: order });
    await Cache.invalidateOrganization(organization);
    return order;
};
module.exports = { createOrder, getAllOrder, getOrderById, updateOrderStatus, CancelOrder, deleteOrder, restoreOrder };
