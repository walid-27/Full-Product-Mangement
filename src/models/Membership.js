const mongoose = require("mongoose");

const MembershipSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: "AuthModel", required: true },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
    role: { type: String, enum: ["owner", "admin", "staff", "viewer"], required: true },
    status: { type: String, enum: ["active", "invited", "suspended"], default: "active", required: true }
}, { timestamps: true });

MembershipSchema.index({ user: 1, organization: 1 }, { unique: true });
MembershipSchema.index({ organization: 1, status: 1, role: 1 });

module.exports = mongoose.model("Membership", MembershipSchema);
