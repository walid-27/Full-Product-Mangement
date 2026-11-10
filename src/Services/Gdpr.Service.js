const Auth = require("../models/Auth");
const Organization = require("../models/Organization");
const Membership = require("../models/Membership");
const Product = require("../models/Product");
const Order = require("../models/Order");
const StockMovement = require("../models/Inventory");
const AuditLog = require("../models/AuditLog");
const RefreshToken = require("../models/RefreshToken");
const AppError = require("../utils/AppError");

const exportAccount = async (userId) => {
    const [user, memberships] = await Promise.all([
        Auth.findById(userId).select("-password -refreshTokens").lean(),
        Membership.find({ user: userId }).lean()
    ]);
    const organizationIds = memberships.map((membership) => membership.organization);
    const [products, orders, movements, auditLogs] = await Promise.all([
        Product.find({ organization: { $in: organizationIds } }).lean(),
        Order.find({ organization: { $in: organizationIds } }).lean(),
        StockMovement.find({ organization: { $in: organizationIds } }).lean(),
        AuditLog.find({ actor: userId }).lean()
    ]);
    return { exportedAt: new Date(), user, memberships, products, orders, movements, auditLogs };
};
const scheduleAccountDeletion = async (userId) => {
    await Auth.updateOne({ _id: userId }, { $set: { deletionScheduledAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) } });
    await RefreshToken.updateMany({ user: userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
};
const purgeDue = async () => {
    const organizations = await Organization.find({ deletionScheduledAt: { $lte: new Date() }, status: "deletion_pending" });
    for (const organization of organizations) {
        await Promise.all([
            Product.deleteMany({ organization: organization._id }),
            Order.deleteMany({ organization: organization._id }),
            StockMovement.deleteMany({ organization: organization._id }),
            Membership.deleteMany({ organization: organization._id }),
            require("../models/ApiKey").deleteMany({ organization: organization._id }),
            require("../models/OutgoingWebhook").deleteMany({ organization: organization._id }),
            require("../models/Subscription").deleteMany({ organization: organization._id }),
            require("../models/UsageCounter").deleteMany({ organization: organization._id }),
            require("../models/AnalyticsEvent").deleteMany({ organization: organization._id })
        ]);
        organization.status = "deleted";
        await organization.save();
    }
    const users = await Auth.find({ deletionScheduledAt: { $lte: new Date() } });
    for (const user of users) {
        user.email = `deleted-${user._id}@example.invalid`;
        user.name = "Deleted user";
        user.password = "deleted";
        user.deletionScheduledAt = null;
        await user.save();
        await Membership.deleteMany({ user: user._id });
        await RefreshToken.deleteMany({ user: user._id });
    }
    return { organizations: organizations.length, users: users.length };
};
module.exports = { exportAccount, scheduleAccountDeletion, purgeDue };
