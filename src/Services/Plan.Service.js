const Subscription = require("../models/Subscription");
const Organization = require("../models/Organization");
const Product = require("../models/Product");
const Membership = require("../models/Membership");
const UsageCounter = require("../models/UsageCounter");
const AppError = require("../utils/AppError");
const Audit = require("./Audit.Service");
const { getPlan } = require("../config/plans");

const monthKey = (date = new Date()) => date.toISOString().slice(0, 7);
const upgradeRequired = (resource) => new AppError(
    `Upgrade required: ${resource} limit or feature is unavailable on your plan`,
    402, "UPGRADE_REQUIRED"
);

const resolveSubscription = async (organization) => {
    let subscription = await Subscription.findOne({ organization });
    if (!subscription) {
        subscription = await Subscription.create({ organization, plan: "free", status: "active" });
    }
    const now = new Date();
    const expiredTrial = subscription.status === "trialing" && subscription.trialEndsAt && subscription.trialEndsAt <= now;
    const expiredPeriod = subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd && subscription.currentPeriodEnd <= now;
    const expiredGrace = subscription.status === "past_due" && subscription.gracePeriodEndsAt && subscription.gracePeriodEndsAt <= now;
    if (expiredTrial || expiredPeriod || expiredGrace) {
        const before = subscription.toObject();
        subscription.plan = "free";
        subscription.status = "canceled";
        subscription.cancelAtPeriodEnd = false;
        await subscription.save();
        await Organization.updateOne({ _id: organization }, { $set: { plan: "free" } });
        const owner = await Membership.findOne({ organization, role: "owner", status: "active" }).lean();
        if (owner) await Audit.record({
            organization, actor: owner.user, action: "billing.subscription.downgrade",
            entity: "billing", entityId: subscription._id, before, after: subscription
        });
    }
    return subscription;
};

const getEntitlements = async (organization) => {
    const subscription = await resolveSubscription(organization);
    return { subscription, plan: getPlan(subscription.plan) };
};

const assertProductCreation = async (organization) => {
    const { plan } = await getEntitlements(organization);
    if (plan.maxProducts !== null && await Product.countDocuments({ organization }) >= plan.maxProducts) {
        throw upgradeRequired("product");
    }
};

const assertTeamInvite = async (organization) => {
    const { plan } = await getEntitlements(organization);
    if (plan.maxTeamMembers !== null && await Membership.countDocuments({ organization, status: "active" }) >= plan.maxTeamMembers) {
        throw upgradeRequired("team member");
    }
};

const consumeOrderUsage = async (organization, session) => {
    const { plan } = await getEntitlements(organization);
    const month = monthKey();
    const filter = { organization, month };
    if (plan.maxOrdersPerMonth !== null) filter.orders = { $lt: plan.maxOrdersPerMonth };
    try {
        const usage = await UsageCounter.findOneAndUpdate(filter, {
            $inc: { orders: 1 }, $setOnInsert: { organization, month }
        }, { new: true, upsert: true, session });
        if (!usage) throw upgradeRequired("monthly order");
        return usage;
    } catch (err) {
        if (err.code === 11000) throw upgradeRequired("monthly order");
        throw err;
    }
};

const getUsage = async (organization) => {
    const [{ subscription, plan }, products, teamMembers, usage] = await Promise.all([
        getEntitlements(organization),
        Product.countDocuments({ organization }),
        Membership.countDocuments({ organization, status: "active" }),
        UsageCounter.findOne({ organization, month: monthKey() }).lean()
    ]);
    return {
        plan: subscription.plan, status: subscription.status, month: monthKey(),
        products: { used: products, limit: plan.maxProducts },
        orders: { used: usage?.orders || 0, limit: plan.maxOrdersPerMonth },
        teamMembers: { used: teamMembers, limit: plan.maxTeamMembers },
        features: plan.features
    };
};

const requireFeature = (feature) => async (req, res, next) => {
    try {
        const { plan } = await module.exports.getEntitlements(req.orgId);
        if (!plan.features[feature]) throw upgradeRequired(feature);
        return next();
    } catch (err) { return next(err); }
};

module.exports = {
    monthKey, resolveSubscription, getEntitlements, assertProductCreation,
    assertTeamInvite, consumeOrderUsage, getUsage, requireFeature
};
