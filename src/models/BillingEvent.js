const mongoose = require("mongoose");

const BillingEventSchema = new mongoose.Schema({
    eventId: { type: String, required: true, unique: true },
    type: { type: String, required: true },
    processedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model("BillingEvent", BillingEventSchema);
