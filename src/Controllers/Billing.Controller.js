const Billing = require("../Services/Billing.Service");
const Plans = require("../Services/Plan.Service");

const subscription = async (req, res, next) => {
    try { return res.status(200).json(await Plans.resolveSubscription(req.orgId)); } catch (err) { return next(err); }
};
const usage = async (req, res, next) => {
    try { return res.status(200).json(await Plans.getUsage(req.orgId)); } catch (err) { return next(err); }
};
const checkout = async (req, res, next) => {
    try { return res.status(201).json(await Billing.createCheckout(req.orgId, req.body.plan, req.auditContext)); } catch (err) { return next(err); }
};
const portal = async (req, res, next) => {
    try { return res.status(200).json(await Billing.portal(req.orgId)); } catch (err) { return next(err); }
};
const cancel = async (req, res, next) => {
    try { return res.status(200).json(await Billing.cancel(req.orgId, req.auditContext)); } catch (err) { return next(err); }
};
const invoices = async (req, res, next) => {
    try { return res.status(200).json(await Billing.listInvoices(req.orgId, req.query)); } catch (err) { return next(err); }
};
const webhook = async (req, res, next) => {
    try {
        const result = await Billing.handleWebhook(req.body, req.get("signature"));
        return res.status(200).json(result);
    } catch (err) { return next(err); }
};

module.exports = { subscription, usage, checkout, portal, cancel, invoices, webhook };
