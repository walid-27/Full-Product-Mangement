const mongoose = require("mongoose");
const Order = require("../models/Order");
const Product = require("../models/Product");
const StockMovement = require("../models/Inventory");

const sales = async (organization, period = "day") => {
    const formats = { day: "%Y-%m-%d", week: "%G-W%V", month: "%Y-%m" };
    if (!formats[period]) period = "day";
    return Order.aggregate([
        { $match: { organization: new mongoose.Types.ObjectId(organization), status: "delivered", deletedAt: null } },
        { $group: {
            _id: { $dateToString: { format: formats[period], date: "$createdAt" } },
            revenue: { $sum: "$totalPrice" }, orders: { $sum: 1 },
            profit: { $sum: { $reduce: {
                input: "$products", initialValue: 0,
                in: { $add: ["$$value", { $multiply: [{ $subtract: ["$$this.price", "$$this.costPrice"] }, "$$this.quantity"] }] }
            } } }
        } },
        { $sort: { _id: -1 } }
    ]);
};
const bestSellers = async (organization) => Order.aggregate([
    { $match: { organization: new mongoose.Types.ObjectId(organization), deletedAt: null } },
    { $unwind: "$products" },
    { $group: { _id: "$products.product", quantity: { $sum: "$products.quantity" }, revenue: { $sum: { $multiply: ["$products.price", "$products.quantity"] } } } },
    { $sort: { quantity: -1 } }, { $limit: 20 },
    { $lookup: { from: "products", localField: "_id", foreignField: "_id", as: "product" } },
    { $unwind: "$product" }, { $project: { name: "$product.name", quantity: 1, revenue: 1 } }
]);
const stockReport = async (organization) => Product.aggregate([
    { $match: { organization: new mongoose.Types.ObjectId(organization), deletedAt: null } },
    { $group: {
        _id: null, stockValue: { $sum: { $multiply: ["$price", "$stock"] } },
        potentialProfit: { $sum: { $multiply: [{ $subtract: ["$price", "$costPrice"] }, "$stock"] } },
        lowStock: { $sum: { $cond: [{ $and: [{ $gt: ["$stock", 0] }, { $lte: ["$stock", "$lowStockThreshold"] }] }, 1, 0] } },
        outOfStock: { $sum: { $cond: [{ $eq: ["$stock", 0] }, 1, 0] } }
    } },
    { $project: { _id: 0 } }
]);
const movementHistory = async (organization, query) => {
    const page = Number(query.page || 1); const limit = Math.min(Number(query.limit || 25), 100);
    const filter = { organization, ...(query.product ? { product: query.product } : {}), ...(query.action ? { action: query.action } : {}) };
    const [movements, total] = await Promise.all([
        StockMovement.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate("product", "name sku").lean(),
        StockMovement.countDocuments(filter)
    ]);
    return { movements, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};
module.exports = { sales, bestSellers, stockReport, movementHistory };
