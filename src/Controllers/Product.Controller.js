const ProductServices = require("../Services/Product.Service");
const AppError = require("../utils/AppError");

const createProduct = async (req, res, next) => {
    try {
        const product = await ProductServices.createProduct(req.body, req.file, req.orgId, req.auditContext);
        return res.status(201).json({ product });
    } catch (err) {
        if (err.code === 11000) return next(new AppError("Product already exists", 409, "PRODUCT_EXISTS"));
        return next(err);
    }
};

const getProduct = async (req, res, next) => {
    try {
        const products = await ProductServices.getProduct(
            req.orgId, req.query.search, req.query.category,
            req.query.page, req.query.limit, req.query.sort
        );
        return res.status(200).json(products);
    } catch (err) { return next(err); }
};

const updateProduct = async (req, res, next) => {
    try {
        const product = await ProductServices.updateProduct(
            req.body, req.file, req.params.id, req.orgId, req.auditContext
        );
        return res.status(200).json(product);
    } catch (err) { return next(err); }
};

const deleteProduct = async (req, res, next) => {
    try {
        const result = await ProductServices.deleteProduct(req.params.id, req.orgId, req.auditContext);
        return res.status(200).json(result);
    } catch (err) { return next(err); }
};

const analysisProducts = async (req, res, next) => {
    try {
        const result = await ProductServices.analysisProducts(req.orgId);
        return res.status(200).json(result);
    } catch (err) { return next(err); }
};

module.exports = { createProduct, getProduct, updateProduct, deleteProduct, analysisProducts };
