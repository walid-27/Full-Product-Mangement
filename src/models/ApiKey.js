const mongoose = require("mongoose");
const ApiKeySchema = new mongoose.Schema({
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
    name: { type: String, required: true },
    prefix: { type: String, required: true, unique: true },
    keyHash: { type: String, required: true, unique: true },
    scopes: { type: [String], enum: ["read", "write"], default: ["read"] },
    rateLimitPerMinute: { type: Number, default: 60, min: 1, max: 10000 },
    revokedAt: { type: Date, default: null },
    lastUsedAt: { type: Date, default: null }
}, { timestamps: true });
ApiKeySchema.index({ organization: 1, revokedAt: 1 });
module.exports = mongoose.model("ApiKey", ApiKeySchema);
