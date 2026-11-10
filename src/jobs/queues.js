const { Queue } = require("bullmq");
const { loadEnv } = require("../config/env");
const Jobs = require("../Services/Job.Service");

let queue;
const getQueue = () => {
    if (!queue) queue = new Queue("saas-jobs", { connection: { url: loadEnv().REDIS_URL } });
    return queue;
};
const enqueue = async (name, data, options = {}) => {
    if (loadEnv().QUEUE_ENABLED) return getQueue().add(name, data, {
        attempts: 5,
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
        ...options
    });
    return Jobs.processJob({ name, data });
};
const scheduleRecurringJobs = async () => {
    if (!loadEnv().QUEUE_ENABLED) return;
    await getQueue().add("trial-expiry", {}, { repeat: { every: 60 * 60 * 1000 }, jobId: "trial-expiry-hourly" });
    await getQueue().add("low-stock", {}, { repeat: { every: 24 * 60 * 60 * 1000 }, jobId: "low-stock-daily" });
    await getQueue().add("monthly-usage", {}, { repeat: { every: 24 * 60 * 60 * 1000 }, jobId: "monthly-usage-daily" });
    await getQueue().add("gdpr-purge", {}, { repeat: { every: 24 * 60 * 60 * 1000 }, jobId: "gdpr-purge-daily" });
};

module.exports = { enqueue, scheduleRecurringJobs };
