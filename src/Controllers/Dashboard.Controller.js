const Dashboard = require("../Services/Dashboard.Service");

const AnalysisProduct = async (req, res, next) => {
    try {
        const products = await Dashboard.AnalysisProduct(req.orgId, req.query.date);
        return res.status(200).json(products);
    } catch (err) { return next(err); }
};

const AnalysisOrder = async (req, res, next) => {
    try {
        const orders = await Dashboard.AnalysisOrder(req.orgId, req.query.period === "30d");
        return res.status(200).json(orders);
    } catch (err) { return next(err); }
};

module.exports = { AnalysisProduct, AnalysisOrder };
