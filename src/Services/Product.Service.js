const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const Product = require("../models/Product");
const AppError = require("../utils/AppError");
const escapeRegExp = require("../utils/escapeRegExp");
const Audit = require("./Audit.Service");
const Plans = require("./Plan.Service");

const createProduct = async (data, file, organization, context) => {
    await Plans.assertProductCreation(organization);
    if (!file) throw new AppError("check your form ", 400);
    const { name, price, category, stock, lowStockThreshold } = data;
    if (await Product.exists({ name, organization })) {
        throw new AppError("Product already exists", 409, "PRODUCT_EXISTS");
    }

    const product = await Product.create({
        name, price, category, stock, lowStockThreshold, organization, image: file.filename
    });
    await Audit.record({
        organization, ...context, action: "product.create", entity: "product",
        entityId: product._id, after: product
    });
    return { message: "the product has been successfully created", Product: product };
};

const getProduct = async (organization, querySearch, queryCategory, queryPage, queryLimit, querySort) => {
    const page = Number(queryPage ?? 1);
    const limit = Number(queryLimit ?? 12);
    if (!Number.isInteger(page) || page < 1) throw new AppError("Page must be a positive integer", 400);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
        throw new AppError("Limit must be between 1 and 50", 400);
    }

    const filter = { organization };
    if (querySearch) filter.name = { $regex: escapeRegExp(querySearch), $options: "i" };
    if (queryCategory) filter.category = { $regex: escapeRegExp(queryCategory), $options: "i" };
    const allowedSortFields = ["name", "price", "createdAt"];
    const sortField = allowedSortFields.includes(querySort) ? querySort : "createdAt";

    const [products, total] = await Promise.all([
        Product.find(filter).sort({ [sortField]: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        Product.countDocuments(filter)
    ]);
    return {
        products,
        pagnition: { page, limit, total, totalPages: Math.ceil(total / limit) }
    };
};

const removeImage = (filename) => {
    if (!filename) return;
    fs.unlink(path.join(__dirname, "../..", "uploads", filename), (err) => {
        if (err && err.code !== "ENOENT") console.log("image deletion failed", err.message);
    });
};

const updateProduct = async (data, file, productId, organization, context) => {
    const product = await Product.findOne({ _id: productId, organization });
    if (!product) throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
    const before = product.toObject();
    const previousImage = product.image;
    if (file) product.image = file.filename;
    for (const field of ["name", "price", "category", "lowStockThreshold"]) {
        if (data[field] !== undefined) product[field] = data[field];
    }
    await product.save();
    await Audit.record({
        organization, ...context, action: "product.update", entity: "product",
        entityId: product._id, before, after: product
    });
    if (file && previousImage !== file.filename) removeImage(previousImage);
    return { message: "the prdouct was successfully updated", product };
};

const deleteProduct = async (productId, organization, context) => {
    const product = await Product.findOne({ _id: productId, organization });
    if (!product) throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
    await Product.deleteOne({ _id: productId, organization });
    await Audit.record({
        organization, ...context, action: "product.delete", entity: "product",
        entityId: product._id, before: product
    });
    removeImage(product.image);
    return { message: "the product is deleted" };
};

const analysisProducts = async (organization) => {
    const results = await Product.aggregate([
        { $match: { organization: new mongoose.Types.ObjectId(organization) } },
        { $group: {
            _id: null,
            totalProducts: { $sum: 1 },
            totalStock: { $sum: "$stock" },
            totalstockValue: { $sum: { $multiply: ["$price", "$stock"] } }
        } },
        { $project: { _id: 0, totalProducts: 1, totalStock: 1, totalstockValue: 1 } }
    ]);
    return results[0] || { totalProducts: 0, totalStock: 0, totalStockValue: 0, averagePrice: 0 };
};

module.exports = { createProduct, getProduct, updateProduct, deleteProduct, analysisProducts };
