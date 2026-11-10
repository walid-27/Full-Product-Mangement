const mongoose = require("mongoose");
const Product = require("../models/Product");
const StockMovement = require("../models/Inventory");
const AppError = require("../utils/AppError");
const Audit = require("./Audit.Service");
const Cache = require("./Cache.Service");

const validateQuantity = (quantity) => {
    if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new AppError("Quantity must be a positive integer", 400);
    }
};

const StockIn = async (data, productId, organization, session = null, context = {}) => {
    const { quantity, variantSku } = data;
    validateQuantity(quantity);
    const ownSession = !session;
    if (ownSession) session = await mongoose.startSession();

    const perform = async () => {
        const product = await Product.findOne({ organization, _id: productId, deletedAt: null }).session(session);
        if (!product) throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
        const before = product.toObject();
        const stockBefore = product.stock;
        if (variantSku) {
            const variant = product.variants.find((item) => item.sku === variantSku);
            if (!variant) throw new AppError("Variant not found", 404, "VARIANT_NOT_FOUND");
            variant.stock += quantity;
        }
        product.stock += quantity;
        await product.save({ session });
        const [movement] = await StockMovement.create([{
            organization, product: productId, action: "in", quantity, variantSku,
            stockBefore, stockAfter: product.stock
        }], { session });
        await Audit.record({
            organization, ...context, action: "stock.in", entity: "stockMovement",
            entityId: movement._id, before, after: product
        }, session);
        return movement;
    };

    try {
        const result = ownSession ? await session.withTransaction(perform) : await perform();
        await Cache.invalidateOrganization(organization);
        return result;
    } finally {
        if (ownSession) await session.endSession();
    }
};

const StockOut = async (data, productId, organization, session = null, context = {}) => {
    const { quantity, variantSku } = data;
    validateQuantity(quantity);
    const ownSession = !session;
    if (ownSession) session = await mongoose.startSession();

    const perform = async () => {
        const product = await Product.findOneAndUpdate({
            organization, _id: productId, deletedAt: null, stock: { $gte: quantity },
            ...(variantSku ? { variants: { $elemMatch: { sku: variantSku, stock: { $gte: quantity } } } } : {})
        }, { $inc: { stock: -quantity, ...(variantSku ? { "variants.$[variant].stock": -quantity } : {}) } }, { returnDocument: "before", session, ...(variantSku ? { arrayFilters: [{ "variant.sku": variantSku }] } : {}) });
        if (!product) {
            if (!await Product.exists({ organization, _id: productId }).session(session)) {
                throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
            }
            throw new AppError("Insufficient stock", 409, "INSUFFICIENT_STOCK");
        }
        const stockAfter = product.stock - quantity;
        const [movement] = await StockMovement.create([{
            organization, product: productId, action: "out", quantity, variantSku,
            stockBefore: product.stock, stockAfter
        }], { session });
        const after = await Product.findOne({ _id: product._id, organization }).session(session).lean();
        await Audit.record({
            organization, ...context, action: "stock.out", entity: "stockMovement",
            entityId: movement._id, before: product, after
        }, session);
        return movement;
    };

    try {
        const result = ownSession ? await session.withTransaction(perform) : await perform();
        await Cache.invalidateOrganization(organization);
        return result;
    } finally {
        if (ownSession) await session.endSession();
    }
};

const stockAlert = async (organization) => Product.find({
    organization,
    deletedAt: null,
    stock: { $gt: 0 },
    $expr: { $lte: ["$stock", "$lowStockThreshold"] }
}).lean();

const OutStock = async (organization) => Product.find({ organization, deletedAt: null, stock: 0 }).lean();

module.exports = { StockIn, StockOut, stockAlert, OutStock };
