const mongoose = require("mongoose");

const OrganizationInviteSchema = new mongoose.Schema({
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    role: { type: String, enum: ["owner", "admin", "staff", "viewer"], required: true },
    tokenHash: { type: String, required: true, unique: true },
    invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: "AuthModel", required: true },
    expiresAt: { type: Date, required: true },
    acceptedAt: { type: Date, default: null }
}, { timestamps: true });

OrganizationInviteSchema.index({ organization: 1, email: 1, acceptedAt: 1 });
OrganizationInviteSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

module.exports = mongoose.model("OrganizationInvite", OrganizationInviteSchema);
