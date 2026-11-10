const ImportExport = require("../Services/ImportExport.Service");
const Reports = require("../Services/Report.Service");
const Documents = require("../Services/Document.Service");
const Delivery = require("../Services/Delivery.Service");

const importProducts = async (req, res, next) => {
    try {
        if (!req.file?.buffer) return res.status(400).json({ code: "CSV_FILE_REQUIRED", message: "Upload one CSV file in the file field" });
        return res.status(200).json(await ImportExport.importProducts(req.file.buffer, req.orgId, req.auditContext));
    }
    catch (err) { return next(err); }
};
const exportData = async (req, res, next) => {
    try {
        const file = await ImportExport.exportData(req.params.type, req.orgId, req.query.format);
        res.set({ "Content-Type": file.contentType, "Content-Disposition": `attachment; filename="${req.params.type}.${file.extension}"` });
        return res.send(file.body);
    } catch (err) { return next(err); }
};
const report = (producer) => async (req, res, next) => {
    try { return res.status(200).json(await producer(req)); } catch (err) { return next(err); }
};
const orderDocument = async (req, res, next) => {
    try {
        const pdf = await Documents.orderDocument(req.orgId, req.params.id, req.params.type);
        res.set({ "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${req.params.type}-${req.params.id}.pdf"` });
        return res.send(pdf);
    } catch (err) { return next(err); }
};
const shipment = async (req, res, next) => {
    try {
        const order = await require("../models/Order").findOne({ _id: req.params.id, organization: req.orgId, deletedAt: null });
        if (!order) return res.status(404).json({ code: "ORDER_NOT_FOUND", message: "Order not found" });
        return res.status(201).json(await Delivery.getDeliveryProvider().createShipment(order));
    } catch (err) { return next(err); }
};
module.exports = {
    importProducts, exportData,
    sales: report((req) => Reports.sales(req.orgId, req.query.period)),
    bestSellers: report((req) => Reports.bestSellers(req.orgId)),
    stock: report(async (req) => (await Reports.stockReport(req.orgId))[0] || { stockValue: 0, potentialProfit: 0, lowStock: 0, outOfStock: 0 }),
    movements: report((req) => Reports.movementHistory(req.orgId, req.query)),
    orderDocument, shipment
};
