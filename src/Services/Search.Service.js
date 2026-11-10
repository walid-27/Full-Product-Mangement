const Product = require("../models/Product");
const Order = require("../models/Order");
const escapeRegExp = require("../utils/escapeRegExp");

const search = async (organization, query) => {
    const regex = { $regex: escapeRegExp(query.q), $options: "i" };
    const limit = Math.min(Number(query.limit || 20), 50);
    const [products, orders] = await Promise.all([
        Product.find({ organization, deletedAt: null, $or: [{ name: regex }, { category: regex }, { sku: regex }, { barcode: regex }] }).limit(limit).lean(),
        Order.find({ organization, deletedAt: null, $or: [{ "userInfo.name": regex }, { "userInfo.city": regex }] }).limit(limit).lean()
    ]);
    return { products, orders };
};
module.exports = { search };
