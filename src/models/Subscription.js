const mongoose = require("mongoose");

const SubscriptionSchema = new mongoose.Schema({
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, unique: true },
    plan: { type: String, enum: ["free", "pro", "business"], default: "free" },
    status: { type: String, enum: ["trialing", "active", "past_due", "canceled"], default: "trialing" },
    trialEndsAt: { type: Date, default: null },
    currentPeriodEnd: { type: Date, default: null },
    gracePeriodEndsAt: { type: Date, default: null },
    cancelAtPeriodEnd: { type: Boolean, default: false },
    trialEndingEmailSentAt: { type: Date, default: null },
    providerCustomerId: { type: String, default: null },
    providerCheckoutId: { type: String, default: null }
}, { timestamps: true });

SubscriptionSchema.index({ status: 1, trialEndsAt: 1 });
SubscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });

module.exports = mongoose.model("Subscription", SubscriptionSchema);
