const Organization = require("../models/Organization");
const Membership = require("../models/Membership");
const UsageCounter = require("../models/UsageCounter");
const Audit = require("./Audit.Service");
const { signAccessToken } = require("./Auth.Service");
const AppError = require("../utils/AppError");

const listTenants = async (query) => {
    const page = Number(query.page || 1); const limit = Math.min(Number(query.limit || 25), 100);
    const filter = query.status ? { status: query.status } : {};
    const [tenants, total] = await Promise.all([
        Organization.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        Organization.countDocuments(filter)
    ]);
    return { tenants, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};
const setSuspension = async (organization, suspended, context) => {
    const tenant = await Organization.findById(organization);
    if (!tenant) throw new AppError("Organization not found", 404, "ORGANIZATION_NOT_FOUND");
    const before = tenant.toObject();
    tenant.status = suspended ? "suspended" : "active";
    tenant.suspendedAt = suspended ? new Date() : null;
    if (!suspended) tenant.deletionScheduledAt = null;
    await tenant.save();
    await Audit.record({ organization, actor: context.actor, ip: context.ip, action: suspended ? "admin.tenant.suspend" : "admin.tenant.restore", entity: "organization", entityId: organization, before, after: tenant });
    return tenant;
};
const usage = async (organization) => ({
    organization,
    members: await Membership.countDocuments({ organization, status: "active" }),
    usage: await UsageCounter.find({ organization }).sort({ month: -1 }).limit(12).lean()
});
const impersonate = async (admin, user, organization, ip) => {
    const membership = await Membership.findOne({ user, organization, status: "active" });
    if (!membership) throw new AppError("Active membership not found", 404, "MEMBERSHIP_NOT_FOUND");
    await Audit.record({ organization, actor: admin._id, ip, action: "admin.support.impersonate", entity: "membership", entityId: membership._id, after: { impersonatedUser: user } });
    return { token: signAccessToken({ _id: user, email: "impersonated" }, organization), role: membership.role };
};
module.exports = { listTenants, setSuspension, usage, impersonate };
