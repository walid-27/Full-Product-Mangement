const Billing = require("./Billing.Service");
const Notifications = require("./Notification.Service");
const UsageCounter = require("../models/UsageCounter");
const Subscription = require("../models/Subscription");
const Plans = require("./Plan.Service");
const Webhooks = require("./Webhook.Service");

const processJob = async (job) => {
    switch (job.name) {
        case "email": return Notifications.send(job.data);
        case "low-stock": return Notifications.sendLowStockAlerts();
        case "trial-expiry": {
            await Billing.sendTrialEndingReminders();
            const expired = await Subscription.find({ status: "trialing", trialEndsAt: { $lte: new Date() } });
            for (const subscription of expired) await Plans.resolveSubscription(subscription.organization);
            return expired.length;
        }
        case "gdpr-purge": return require("./Gdpr.Service").purgeDue();
        case "monthly-usage": return UsageCounter.deleteMany({ createdAt: { $lt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) } });
        case "webhook": return Webhooks.deliver(job.data);
        case "export": {
            const result = await require("./ImportExport.Service").exportData(job.data.type, job.data.organization, job.data.format);
            return { type: job.data.type, contentType: result.contentType, extension: result.extension, body: result.body.toString("base64") };
        }
        default: throw new Error(`Unknown job ${job.name}`);
    }
};

module.exports = { processJob };
