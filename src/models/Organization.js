const mongoose = require("mongoose");

const OrganizationSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 150 },
    slug: { type: String, required: true, unique: true, lowercase: true, index: true },
    plan: { type: String, enum: ["free", "pro", "business"], default: "free" },
    status: { type: String, enum: ["active", "suspended", "deletion_pending", "deleted"], default: "active", index: true },
    deletionScheduledAt: { type: Date, default: null },
    suspendedAt: { type: Date, default: null }
}, { timestamps: { createdAt: true, updatedAt: false } });

module.exports = mongoose.model("Organization", OrganizationSchema);
