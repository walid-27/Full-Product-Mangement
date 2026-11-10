const mongoose = require("mongoose");

const OrganizationSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 150 },
    slug: { type: String, required: true, unique: true, lowercase: true, index: true },
    plan: { type: String, enum: ["free", "pro", "business"], default: "free" },
    status: { type: String, enum: ["active", "suspended", "deleted"], default: "active", index: true }
}, { timestamps: { createdAt: true, updatedAt: false } });

module.exports = mongoose.model("Organization", OrganizationSchema);
