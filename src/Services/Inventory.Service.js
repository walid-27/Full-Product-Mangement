const mongoose = require("mongoose");
const Product = require("../models/Product");
const StockMovement = require("../models/Inventory");
const AppError = require("../utils/AppError");
const Audit = require("./Audit.Service");

const validateQuantity = (quantity) => {
    if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new AppError("Quantity must be a positive integer", 400);
    }
};

const StockIn = async (data, productId, organization, session = null, context = {}) => {
    const { quantity } = data;
    validateQuantity(quantity);
    const ownSession = !session;
    if (ownSession) session = await mongoose.startSession();

    const perform = async () => {
        const product = await Product.findOne({ organization, _id: productId }).session(session);
        if (!product) throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
        const before = product.toObject();
        const stockBefore = product.stock;
        product.stock += quantity;
        await product.save({ session });
        const [movement] = await StockMovement.create([{
            organization, product: productId, action: "in", quantity,
            stockBefore, stockAfter: product.stock
        }], { session });
        await Audit.record({
            organization, ...context, action: "stock.in", entity: "stockMovement",
            entityId: movement._id, before, after: product
        }, session);
        return movement;
    };

    try {
        return ownSession ? await session.withTransaction(perform) : await perform();
    } finally {
        if (ownSession) await session.endSession();
    }
};

const StockOut = async (data, productId, organization, session = null, context = {}) => {
    const { quantity } = data;
    validateQuantity(quantity);
    const ownSession = !session;
    if (ownSession) session = await mongoose.startSession();

    const perform = async () => {
        const product = await Product.findOneAndUpdate({
            organization, _id: productId, stock: { $gte: quantity }
        }, { $inc: { stock: -quantity } }, { returnDocument: "before", session });
        if (!product) {
            if (!await Product.exists({ organization, _id: productId }).session(session)) {
                throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
            }
            throw new AppError("Insufficient stock", 409, "INSUFFICIENT_STOCK");
        }
        const stockAfter = product.stock - quantity;
        const [movement] = await StockMovement.create([{
            organization, product: productId, action: "out", quantity,
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
        return ownSession ? await session.withTransaction(perform) : await perform();
    } finally {
        if (ownSession) await session.endSession();
    }
};

const stockAlert = async (organization) => Product.find({
    organization,
    stock: { $gt: 0 },
    $expr: { $lte: ["$stock", "$lowStockThreshold"] }
}).lean();

const OutStock = async (organization) => Product.find({ organization, stock: 0 }).lean();

module.exports = { StockIn, StockOut, stockAlert, OutStock };
