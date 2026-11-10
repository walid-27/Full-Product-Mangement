const mongoose = require("mongoose");
const AnalyticsEventSchema = new mongoose.Schema({
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization" },
    user: { type: mongoose.Schema.Types.ObjectId, ref: "AuthModel" },
    event: { type: String, required: true },
    properties: { type: mongoose.Schema.Types.Mixed, default: {} }
}, { timestamps: { createdAt: true, updatedAt: false } });
AnalyticsEventSchema.index({ organization: 1, event: 1, createdAt: -1 });
module.exports = mongoose.model("AnalyticsEvent", AnalyticsEventSchema);
