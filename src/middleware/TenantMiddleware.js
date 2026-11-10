const mongoose = require("mongoose");
const Membership = require("../models/Membership");
const Auth = require("../models/Auth");
const Organization = require("../models/Organization");
const AppError = require("../utils/AppError");

const resolveTenant = async (req, res, next) => {
    try {
        const user = await Auth.findById(req.user.userId).select("emailVerifiedAt").lean();
        if (user && Object.hasOwn(user, "emailVerifiedAt") && !user.emailVerifiedAt) {
            throw new AppError("Verify your email before accessing organization data", 403, "EMAIL_NOT_VERIFIED");
        }

        const organizationId = req.get("x-org-id") || req.user.orgId;
        if (!organizationId || !mongoose.isValidObjectId(organizationId)) {
            throw new AppError("An active organization is required", 400, "ORGANIZATION_REQUIRED");
        }

        const [membership, organization] = await Promise.all([
            Membership.findOne({ user: req.user.userId, organization: organizationId, status: "active" }).lean(),
            Organization.findOne({ _id: organizationId, status: "active" }).lean()
        ]);

        if (!membership || !organization) {
            throw new AppError("You do not have access to this organization", 403, "ORGANIZATION_FORBIDDEN");
        }

        req.orgId = organization._id.toString();
        req.organization = organization;
        req.membership = membership;
        req.auditContext = { actor: req.user.userId, ip: req.ip };
        return next();
    } catch (err) {
        return next(err);
    }
};

module.exports = resolveTenant;
