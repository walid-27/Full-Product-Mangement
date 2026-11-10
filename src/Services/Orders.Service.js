const mongoose = require("mongoose");
const Order = require("../models/Order");
const Product = require("../models/Product");
const AppError = require("../utils/AppError");
const Inventory = require("./Inventory.Service");
const escapeRegExp = require("../utils/escapeRegExp");

const createOrder = async (data, userId) => {
    const { products, userInfo } = data;

    if (!Array.isArray(products) || products.length === 0) {
        throw new AppError("Any Product selected", 400);
    }
    if (!userInfo) throw new AppError("Please Complete your Form ", 400);

    for (const item of products) {
        if (!item || !mongoose.isValidObjectId(item.product)) {
            throw new AppError("Invalid product ID", 400);
        }
        if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
            throw new AppError("Quantity must be a positive integer", 400);
        }
    }

    const productsID = products.map((item) => item.product);
    const uniqueProductIds = new Set(productsID.map((id) => id.toString()));

    if (uniqueProductIds.size !== productsID.length) {
        throw new AppError("Duplicate products are not allowed", 400);
    }

    const foundProducts = await Product.find({
        owner: userId,
        _id: { $in: productsID }
    });

    if (foundProducts.length !== uniqueProductIds.size) {
        throw new AppError("One or more products were not found", 404);
    }

    const productById = new Map(
        foundProducts.map((product) => [product._id.toString(), product])
    );

    for (const item of products) {
        const product = productById.get(item.product.toString());
        if (item.quantity > product.stock) {
            throw new AppError(`Insufficient stock for ${product.name}`, 400);
        }
    }

    const totalPrice = products.reduce((total, item) => {
        const product = productById.get(item.product.toString());
        return total + product.price * item.quantity;
    }, 0);

    const orderProducts = products.map((item) => {
        const product = productById.get(item.product.toString());
        return {
            product: product._id,
            quantity: item.quantity,
            price: product.price
        };
    });

    const session = await mongoose.startSession();
    try {
        return await session.withTransaction(async () => {
            for (const item of orderProducts) {
                await Inventory.StockOut(
                    { quantity: item.quantity },
                    item.product,
                    userId,
                    session
                );
            }

            const [order] = await Order.create(
                [{
                    owner: userId,
                    products: orderProducts,
                    userInfo: {
                        name: userInfo.name,
                        number: userInfo.number,
                        city: userInfo.city,
                        address: userInfo.address,
                        delivery: userInfo.delivery
                    },
                    totalPrice,
                    status: "pending"
                }],
                { session }
            );

            return order;
        });
    } finally {
        await session.endSession();
    }
};

const getAllOrder = async (
    userId,
    querySearch,
    queryStatus,
    queryPage,
    queryLimit,
    querySort
) => {
    const page = Number(queryPage ?? 1);
    const limit = Number(queryLimit ?? 12);

    if (!Number.isInteger(page) || page < 1) {
        throw new AppError("the page number should be positive", 400);
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new AppError("the limit must be between 1 and 100", 400);
    }

    const filter = { owner: userId };

    if (querySearch) {
        const safeSearch = escapeRegExp(querySearch);
        filter.$or = [
            { "userInfo.name": { $regex: safeSearch, $options: "i" } },
            { "userInfo.city": { $regex: safeSearch, $options: "i" } }
        ];
    }

    if (queryStatus) filter.status = queryStatus;

    const allowedSortFields = ["totalPrice", "createdAt"];
    const sortField = allowedSortFields.includes(querySort)
        ? querySort
        : "createdAt";

    const orders = await Order.find(filter)
        .sort({ [sortField]: -1 })
        .skip((page - 1) * limit)
        .limit(limit);

    if (orders.length === 0) {
        throw new AppError("find 0 order", 404);
    }

    const total = await Order.countDocuments(filter);

    return {
        orders,
        pagnition: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit)
        }
    };
};

const getOrderById = async (userId, orderId) => {
    if (!mongoose.isValidObjectId(orderId)) {
        throw new AppError("Invalid order ID", 400);
    }

    const order = await Order.findOne({
        _id: orderId,
        owner: userId
    });

    if (!order) throw new AppError("Order not Founded", 404);
    return order;
};

const updateOrderStatus = async (orderId, userId, data) => {
    const { status } = data;
    const allowedTransitions = {
        pending: ["confirmed"],
        confirmed: ["shipped"],
        shipped: ["delivered"],
        delivered: [],
        cancelled: []
    };

    if (!Object.hasOwn(allowedTransitions, status)) {
        throw new AppError("Invalid order status", 400);
    }

    const order = await Order.findOne({ _id: orderId, owner: userId });
    if (!order) throw new AppError("Order Not Found", 404);

    if (!allowedTransitions[order.status].includes(status)) {
        throw new AppError(
            `Cannot change order status from ${order.status} to ${status}`,
            409
        );
    }

    const updatedOrder = await Order.findOneAndUpdate(
        {
            _id: orderId,
            owner: userId,
            status: order.status
        },
        { $set: { status } },
        { new: true, runValidators: true }
    );

    if (!updatedOrder) {
        throw new AppError("Order status changed; please retry", 409);
    }

    return {
        message: "the status has been updated",
        findOrderAndUpdateStatus: updatedOrder
    };
};

const CancelOrder = async (orderId, ownerId) => {
    const order = await Order.findOne({ _id: orderId, owner: ownerId });
    if (!order) throw new AppError("Order Not Found", 404);

    if (order.status === "cancelled") {
        throw new AppError("Order is already cancelled", 400);
    }
    if (["shipped", "delivered"].includes(order.status)) {
        throw new AppError("Cannot cancel an order that has already shipped", 400);
    }
    if (!["pending", "confirmed"].includes(order.status)) {
        throw new AppError("Order cannot be cancelled", 400);
    }

    const session = await mongoose.startSession();
    try {
        const cancelledOrder = await session.withTransaction(async () => {
            for (const item of order.products) {
                await Inventory.StockIn(
                    { quantity: item.quantity },
                    item.product,
                    ownerId,
                    session
                );
            }

            const updatedOrder = await Order.findOneAndUpdate(
                {
                    _id: orderId,
                    owner: ownerId,
                    status: order.status
                },
                { $set: { status: "cancelled" } },
                { new: true, runValidators: true, session }
            );

            if (!updatedOrder) {
                throw new AppError("Order status changed; please retry", 409);
            }

            return updatedOrder;
        });

        return {
            message: "the order has been cancelled",
            CancelOrder: cancelledOrder
        };
    } finally {
        await session.endSession();
    }
};

module.exports = {
    createOrder,
    getAllOrder,
    getOrderById,
    updateOrderStatus,
    CancelOrder
};
