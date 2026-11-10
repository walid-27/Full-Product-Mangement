const PDFDocument = require("pdfkit");
const Order = require("../models/Order");
const AppError = require("../utils/AppError");

const createPdf = (order, type) => new Promise((resolve, reject) => {
    const document = new PDFDocument({ margin: 50 });
    const chunks = [];
    document.on("data", (chunk) => chunks.push(chunk));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);
    document.fontSize(20).text(type === "label" ? "Delivery label" : `Invoice ${order._id}`);
    document.moveDown().fontSize(12).text(`Customer: ${order.userInfo.name}`);
    document.text(`Phone: ${order.userInfo.number}`);
    if (type === "label") {
        document.text(`Address: ${order.userInfo.address}, ${order.userInfo.city}`);
        document.text(`Delivery: ${order.userInfo.delivery}`);
    } else {
        for (const item of order.products) document.text(`${item.quantity} × ${item.price} DZD (${item.variantSku || "standard"})`);
        document.moveDown().fontSize(16).text(`Total: ${order.totalPrice} DZD`);
    }
    document.end();
});
const orderDocument = async (organization, orderId, type) => {
    const order = await Order.findOne({ _id: orderId, organization, deletedAt: null }).lean();
    if (!order) throw new AppError("Order not found", 404, "ORDER_NOT_FOUND");
    return createPdf(order, type);
};
module.exports = { orderDocument };
