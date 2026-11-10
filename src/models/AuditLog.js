const mongoose = require("mongoose");

const AuditLogSchema = new mongoose.Schema({
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: "AuthModel", required: true },
    action: { type: String, required: true, index: true },
    entity: { type: String, required: true, index: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, required: true },
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    ip: { type: String, default: null }
}, { timestamps: { createdAt: true, updatedAt: false } });

AuditLogSchema.index({ organization: 1, createdAt: -1 });
AuditLogSchema.index({ organization: 1, action: 1, entity: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", AuditLogSchema);
