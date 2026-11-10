const mongoose = require("mongoose");

const AuthTokenSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "AuthModel", required: true },
    type: { type: String, enum: ["email-verification", "password-reset"], required: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null }
}, { timestamps: true });

AuthTokenSchema.index({ user: 1, type: 1, usedAt: 1 });
AuthTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("AuthToken", AuthTokenSchema);
