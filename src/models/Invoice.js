const mongoose = require("mongoose");

const InvoiceSchema = new mongoose.Schema({
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
    providerInvoiceId: { type: String, required: true, unique: true },
    providerCheckoutId: { type: String, default: null },
    plan: { type: String, enum: ["free", "pro", "business"], required: true },
    amountDzd: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "DZD" },
    status: { type: String, enum: ["pending", "paid", "failed", "canceled"], default: "pending" },
    paidAt: { type: Date, default: null }
}, { timestamps: true });

InvoiceSchema.index({ organization: 1, createdAt: -1 });

module.exports = mongoose.model("Invoice", InvoiceSchema);
