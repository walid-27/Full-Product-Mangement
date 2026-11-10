const AuditLog = require("../models/AuditLog");

const snapshot = (value) => {
    if (!value) return null;
    return typeof value.toObject === "function" ? value.toObject() : value;
};

const record = async ({ organization, actor, action, entity, entityId, before, after, ip }, session = null) => {
    const [entry] = await AuditLog.create([{
        organization,
        actor,
        action,
        entity,
        entityId,
        before: snapshot(before),
        after: snapshot(after),
        ip
    }], { session });
    return entry;
};

const list = async (organization, filters) => {
    const page = Number(filters.page || 1);
    const limit = Math.min(Number(filters.limit || 25), 100);
    const query = { organization };
    for (const field of ["action", "entity", "actor"]) {
        if (filters[field]) query[field] = filters[field];
    }

    const [logs, total] = await Promise.all([
        AuditLog.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        AuditLog.countDocuments(query)
    ]);

    return { logs, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

module.exports = { record, list };
