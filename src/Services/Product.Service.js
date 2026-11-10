const mongoose = require("mongoose");
const Product = require("../models/Product");
const AppError = require("../utils/AppError");
const escapeRegExp = require("../utils/escapeRegExp");
const Audit = require("./Audit.Service");
const Plans = require("./Plan.Service");
const Storage = require("./Storage.Service");
const Cache = require("./Cache.Service");

const createProduct = async (data, file, organization, context) => {
    await Plans.assertProductCreation(organization);
    if (!file) throw new AppError("check your form ", 400);
    const { name, price, costPrice, category, stock, lowStockThreshold, sku, barcode, variants } = data;
    if (await Product.exists({ name, organization })) {
        throw new AppError("Product already exists", 409, "PRODUCT_EXISTS");
    }
    const image = file.buffer ? await Storage.uploadImage(file, organization) : file.filename;
    const totalStock = variants?.length ? variants.reduce((sum, variant) => sum + variant.stock, 0) : stock;
    const product = await Product.create({
        name, price, costPrice, category, stock: totalStock, lowStockThreshold, sku, barcode, variants, organization, image
    });
    await Audit.record({
        organization, ...context, action: "product.create", entity: "product",
        entityId: product._id, after: product
    });
    await Cache.invalidateOrganization(organization);
    return { message: "the product has been successfully created", Product: product };
};

const getProduct = async (organization, querySearch, queryCategory, queryPage, queryLimit, querySort) => {
    const page = Number(queryPage ?? 1);
    const limit = Number(queryLimit ?? 12);
    if (!Number.isInteger(page) || page < 1) throw new AppError("Page must be a positive integer", 400);
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
        throw new AppError("Limit must be between 1 and 50", 400);
    }

    const filter = { organization, deletedAt: null };
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

const updateProduct = async (data, file, productId, organization, context) => {
    const product = await Product.findOne({ _id: productId, organization, deletedAt: null });
    if (!product) throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
    const before = product.toObject();
    const previousImage = product.image;
    if (file) product.image = file.buffer ? await Storage.uploadImage(file, organization) : file.filename;
    for (const field of ["name", "price", "costPrice", "category", "lowStockThreshold", "sku", "barcode", "variants"]) {
        if (data[field] !== undefined) product[field] = data[field];
    }
    if (data.variants !== undefined) product.stock = data.variants.reduce((sum, variant) => sum + variant.stock, 0);
    await product.save();
    await Audit.record({
        organization, ...context, action: "product.update", entity: "product",
        entityId: product._id, before, after: product
    });
    if (file && previousImage !== product.image) await Storage.deleteImage(previousImage);
    await Cache.invalidateOrganization(organization);
    return { message: "the prdouct was successfully updated", product };
};

const deleteProduct = async (productId, organization, context) => {
    const product = await Product.findOne({ _id: productId, organization, deletedAt: null });
    if (!product) throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
    product.deletedAt = new Date();
    await product.save();
    await Audit.record({
        organization, ...context, action: "product.delete", entity: "product",
        entityId: product._id, before: product
    });
    await Cache.invalidateOrganization(organization);
    return { message: "the product is deleted" };
};

const analysisProducts = async (organization) => {
    const results = await Product.aggregate([
        { $match: { organization: new mongoose.Types.ObjectId(organization), deletedAt: null } },
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

const restoreProduct = async (productId, organization, context) => {
    const product = await Product.findOne({ _id: productId, organization, deletedAt: { $ne: null } });
    if (!product) throw new AppError("Deleted product not found", 404, "PRODUCT_NOT_FOUND");
    const before = product.toObject();
    product.deletedAt = null;
    await product.save();
    await Audit.record({ organization, ...context, action: "product.restore", entity: "product", entityId: product._id, before, after: product });
    await Cache.invalidateOrganization(organization);
    return product;
};

module.exports = { createProduct, getProduct, updateProduct, deleteProduct, restoreProduct, analysisProducts };
