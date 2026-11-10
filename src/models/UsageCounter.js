const mongoose = require("mongoose");

const UsageCounterSchema = new mongoose.Schema({
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
    month: { type: String, required: true, match: /^\d{4}-\d{2}$/ },
    orders: { type: Number, default: 0, min: 0 }
}, { timestamps: true });

UsageCounterSchema.index({ organization: 1, month: 1 }, { unique: true });

module.exports = mongoose.model("UsageCounter", UsageCounterSchema);
