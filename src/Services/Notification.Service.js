const Product = require("../models/Product");
const Membership = require("../models/Membership");
const Email = require("./Email.Service");
const Webhooks = require("./Webhook.Service");

const channels = {
    whatsapp: async (destination, message) => console.log(JSON.stringify({ channel: "whatsapp", destination, message })),
    sms: async (destination, message) => console.log(JSON.stringify({ channel: "sms", destination, message }))
};
const send = async ({ user, type, message }) => {
    if (type === "email") return Email.sendBillingEmail(user, "trialEnding");
    if (channels[type]) return channels[type](user.notifications?.destination, message);
    return null;
};
const sendLowStockAlerts = async () => {
    const products = await Product.find({ deletedAt: null, stock: { $gt: 0 }, $expr: { $lte: ["$stock", "$lowStockThreshold"] } });
    let alerts = 0;
    for (const product of products) {
        await Webhooks.dispatch(product.organization, "stock.low", product);
        const members = await Membership.find({ organization: product.organization, status: "active" }).populate("user");
        for (const member of members) {
            const user = member.user;
            const message = `${product.name} has ${product.stock} units remaining.`;
            if (user.notifications?.lowStockEmail) {
                await Email.sendBillingEmail(user, "lowStock", { message });
                alerts += 1;
            }
            if (user.notifications?.lowStockChannel !== "none") {
                await channels[user.notifications.lowStockChannel](user.notifications.destination, message);
            }
        }
    }
    return alerts;
};
const orderStatus = async (order, status) => {
    console.log(JSON.stringify({ channel: "customer-order-status", order: order._id, status, customer: order.userInfo.name }));
};
module.exports = { send, sendLowStockAlerts, orderStatus, channels };
