const mongoose = require("mongoose");
const OutgoingWebhookSchema = new mongoose.Schema({
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
    url: { type: String, required: true },
    secret: { type: String, required: true },
    events: { type: [String], required: true },
    active: { type: Boolean, default: true }
}, { timestamps: true });
OutgoingWebhookSchema.index({ organization: 1, active: 1 });
module.exports = mongoose.model("OutgoingWebhook", OutgoingWebhookSchema);
