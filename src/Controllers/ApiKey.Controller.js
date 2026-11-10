const ApiKeys = require("../Services/ApiKey.Service");
const Products = require("../Services/Product.Service");
const Orders = require("../Services/Orders.Service");
const Membership = require("../models/Membership");
const AppError = require("../utils/AppError");

const create = async (req, res, next) => { try { return res.status(201).json(await ApiKeys.create(req.orgId, req.body)); } catch (err) { return next(err); } };
const list = async (req, res, next) => { try { return res.status(200).json(await ApiKeys.list(req.orgId)); } catch (err) { return next(err); } };
const revoke = async (req, res, next) => {
    try {
        const key = await ApiKeys.revoke(req.orgId, req.params.id);
        if (!key) throw new AppError("API key not found", 404, "API_KEY_NOT_FOUND");
        return res.status(200).json(key);
    } catch (err) { return next(err); }
};
const publicProducts = async (req, res, next) => {
    try { return res.status(200).json(await Products.getProduct(req.orgId, req.query.search, req.query.category, req.query.page, req.query.limit, req.query.sort)); } catch (err) { return next(err); }
};
const publicOrders = async (req, res, next) => {
    try { return res.status(200).json(await Orders.getAllOrder(req.orgId, req.query.name, req.query.status, req.query.page, req.query.limit, req.query.sort)); } catch (err) { return next(err); }
};
const publicCreateOrder = async (req, res, next) => {
    try {
        const owner = await Membership.findOne({ organization: req.orgId, role: "owner", status: "active" });
        if (!owner) throw new AppError("No active organization owner is available", 409, "OWNER_UNAVAILABLE");
        const order = await Orders.createOrder(req.body, req.orgId, { actor: owner.user, ip: req.ip });
        return res.status(201).json(order);
    } catch (err) { return next(err); }
};
module.exports = { create, list, revoke, publicProducts, publicOrders, publicCreateOrder };
