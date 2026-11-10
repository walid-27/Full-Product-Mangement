const Orders = require("../Services/Orders.Service");

const createOrder = async (req, res, next) => {
    try {
        const order = await Orders.createOrder(req.body, req.orgId, req.auditContext);
        return res.status(201).json({ new_Order: order });
    } catch (err) { return next(err); }
};
const getAllOrder = async (req, res, next) => {
    try {
        const orders = await Orders.getAllOrder(
            req.orgId, req.query.name, req.query.status,
            req.query.page, req.query.limit, req.query.sort
        );
        return res.status(200).json({ Orders: orders });
    } catch (err) { return next(err); }
};
const getOrderById = async (req, res, next) => {
    try {
        const order = await Orders.getOrderById(req.orgId, req.params.id);
        return res.status(200).json({ Order: order });
    } catch (err) { return next(err); }
};
const updateOrderStatus = async (req, res, next) => {
    try {
        const order = await Orders.updateOrderStatus(req.params.id, req.orgId, req.body, req.auditContext);
        return res.status(200).json(order);
    } catch (err) { return next(err); }
};
const CancelOrder = async (req, res, next) => {
    try {
        const order = await Orders.CancelOrder(req.params.id, req.orgId, req.auditContext);
        return res.status(200).json(order);
    } catch (err) { return next(err); }
};

module.exports = { createOrder, getAllOrder, getOrderById, updateOrderStatus, CancelOrder };
