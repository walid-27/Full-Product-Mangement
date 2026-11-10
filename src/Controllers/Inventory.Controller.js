const Inventory = require("../Services/Inventory.Service");

const StockIn = async (req, res, next) => {
    try {
        const stock = await Inventory.StockIn(req.body, req.params.id, req.orgId, null, req.auditContext);
        return res.status(201).json({ new_Quantity: stock });
    } catch (err) { return next(err); }
};

const StockOut = async (req, res, next) => {
    try {
        const stock = await Inventory.StockOut(req.body, req.params.id, req.orgId, null, req.auditContext);
        return res.status(201).json({ new_Quantity: stock });
    } catch (err) { return next(err); }
};

const stockAlert = async (req, res, next) => {
    try {
        const stock = await Inventory.stockAlert(req.orgId);
        return res.status(200).json({ low_Quantity: stock });
    } catch (err) { return next(err); }
};

const OutStock = async (req, res, next) => {
    try {
        const stock = await Inventory.OutStock(req.orgId);
        return res.status(200).json({ out_Quantity: stock });
    } catch (err) { return next(err); }
};

module.exports = { StockIn, StockOut, stockAlert, OutStock };
