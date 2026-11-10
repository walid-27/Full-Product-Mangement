const Subscription = require("../models/Subscription");
const Organization = require("../models/Organization");
const Membership = require("../models/Membership");
const Invoice = require("../models/Invoice");
const BillingEvent = require("../models/BillingEvent");
const AppError = require("../utils/AppError");
const Audit = require("./Audit.Service");
const Plans = require("./Plan.Service");
const Email = require("./Email.Service");
const { getPaymentProvider } = require("./payments");
const { getPlan } = require("../config/plans");
const Analytics = require("./Analytics.Service");

const ownerFor = async (organization) => Membership.findOne({ organization, role: "owner", status: "active" }).populate("user");
const billingAudit = async (organization, context, action, entityId, before, after, session = null) => {
    let actor = context.actor;
    if (!actor) actor = (await ownerFor(organization))?.user?._id;
    if (!actor) return;
    await Audit.record({ organization, actor, ip: context.ip, action, entity: "billing", entityId, before, after }, session);
};

const createCheckout = async (organization, planName, context) => {
    if (!["pro", "business"].includes(planName)) throw new AppError("Invalid plan", 422, "VALIDATION_ERROR");
    const subscription = await Plans.resolveSubscription(organization);
    const provider = getPaymentProvider();
    const checkout = await provider.createCheckout({ organization, plan: planName, amountDzd: getPlan(planName).priceDzd });
    const before = subscription.toObject();
    subscription.providerCheckoutId = checkout.id;
    await subscription.save();
    await Invoice.findOneAndUpdate({ providerInvoiceId: checkout.id }, {
        $set: {
            organization, providerCheckoutId: checkout.id, plan: planName,
            amountDzd: getPlan(planName).priceDzd, status: "pending"
        }
    }, { upsert: true, new: true });
    await billingAudit(organization, context, "billing.checkout.create", subscription._id, before, subscription);
    return { checkoutId: checkout.id, checkoutUrl: checkout.url };
};

const portal = async (organization) => ({ portalUrl: await getPaymentProvider().getPortalUrl(organization) });
const cancel = async (organization, context) => {
    const subscription = await Plans.resolveSubscription(organization);
    const before = subscription.toObject();
    subscription.cancelAtPeriodEnd = true;
    subscription.currentPeriodEnd = subscription.currentPeriodEnd || subscription.trialEndsAt || new Date();
    await subscription.save();
    await billingAudit(organization, context, "billing.subscription.cancel", subscription._id, before, subscription);
    return subscription;
};

const handleWebhook = async (rawBody, signature) => {
    const provider = getPaymentProvider();
    if (!provider.verifyWebhook(rawBody, signature)) {
        throw new AppError("Invalid webhook signature", 401, "INVALID_WEBHOOK_SIGNATURE");
    }
    let payload;
    try { payload = JSON.parse(rawBody.toString("utf8")); } catch (err) {
        throw new AppError("Invalid webhook payload", 422, "VALIDATION_ERROR");
    }
    const data = payload.data || payload.checkout || payload;
    const type = payload.type || payload.event || (data.status ? `checkout.${data.status}` : null);
    const sourceId = payload.event_id || payload.eventId || payload.id || data.id;
    if (!type || !sourceId || !data.id) throw new AppError("Invalid webhook payload", 422, "VALIDATION_ERROR");
    const eventId = `${sourceId}:${type}`;
    try { await BillingEvent.create({ eventId, type }); } catch (err) {
        if (err.code === 11000) return { duplicate: true };
        throw err;
    }

    const organization = data.metadata?.organizationId;
    const subscription = organization
        ? await Subscription.findOne({ organization })
        : await Subscription.findOne({ providerCheckoutId: data.id });
    if (!subscription) return { ignored: true };
    const owner = await ownerFor(subscription.organization);
    const before = subscription.toObject();

    if (["checkout.paid", "checkout.succeeded"].includes(type)) {
        subscription.plan = data.metadata?.plan || subscription.plan;
        subscription.status = "active";
        subscription.currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        subscription.gracePeriodEndsAt = null;
        subscription.cancelAtPeriodEnd = false;
        await Organization.updateOne({ _id: subscription.organization }, { $set: { plan: subscription.plan } });
        await Invoice.updateOne({ providerCheckoutId: data.id }, { $set: { status: "paid", paidAt: new Date() } });
        if (owner?.user) await Email.sendBillingEmail(owner.user, "receipt", { amountDzd: data.amount, invoiceId: data.id });
        await Analytics.track("upgrade", { organization: subscription.organization, plan: subscription.plan });
    } else if (["checkout.failed", "checkout.expired"].includes(type)) {
        subscription.status = "past_due";
        subscription.gracePeriodEndsAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await Invoice.updateOne({ providerCheckoutId: data.id }, { $set: { status: "failed" } });
        if (owner?.user) await Email.sendBillingEmail(owner.user, "paymentFailed");
    } else if (type === "checkout.canceled") {
        subscription.status = "canceled";
        subscription.plan = "free";
        await Organization.updateOne({ _id: subscription.organization }, { $set: { plan: "free" } });
        await Invoice.updateOne({ providerCheckoutId: data.id }, { $set: { status: "canceled" } });
        await Analytics.track("churn", { organization: subscription.organization });
    } else {
        return { ignored: true };
    }
    await subscription.save();
    await billingAudit(subscription.organization, {}, `billing.webhook.${type}`, subscription._id, before, subscription);
    return { processed: true };
};

const listInvoices = async (organization, query) => {
    const page = Number(query.page || 1);
    const limit = Math.min(Number(query.limit || 20), 100);
    const [invoices, total] = await Promise.all([
        Invoice.find({ organization }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        Invoice.countDocuments({ organization })
    ]);
    return { invoices, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

const sendTrialEndingReminders = async () => {
    const now = new Date();
    const subscriptions = await Subscription.find({
        status: "trialing", trialEndsAt: { $gt: now, $lte: new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000) },
        trialEndingEmailSentAt: null
    });
    for (const subscription of subscriptions) {
        const owner = await ownerFor(subscription.organization);
        if (owner?.user) await Email.sendBillingEmail(owner.user, "trialEnding");
        subscription.trialEndingEmailSentAt = new Date();
        await subscription.save();
    }
    return subscriptions.length;
};

module.exports = {
    createCheckout, portal, cancel, handleWebhook, listInvoices, sendTrialEndingReminders
};
