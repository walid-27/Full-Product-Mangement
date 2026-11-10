const { randomBytes } = require("crypto");
const OutgoingWebhook = require("../models/OutgoingWebhook");

const create = async (req, res, next) => {
    try {
        const secret = `whsec_${randomBytes(32).toString("base64url")}`;
        const hook = await OutgoingWebhook.create({ organization: req.orgId, url: req.body.url, events: req.body.events, secret });
        return res.status(201).json({ id: hook._id, url: hook.url, events: hook.events, secret });
    } catch (err) { return next(err); }
};
const list = async (req, res, next) => {
    try { return res.status(200).json(await OutgoingWebhook.find({ organization: req.orgId }).select("-secret").lean()); }
    catch (err) { return next(err); }
};
const remove = async (req, res, next) => {
    try { return res.status(200).json(await OutgoingWebhook.findOneAndDelete({ _id: req.params.id, organization: req.orgId })); }
    catch (err) { return next(err); }
};
module.exports = { create, list, remove };
