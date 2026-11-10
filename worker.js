const { Worker } = require("bullmq");
const mongoose = require("mongoose");
const { loadEnv } = require("./src/config/env");
const Jobs = require("./src/Services/Job.Service");
const { scheduleRecurringJobs } = require("./src/jobs/queues");

const start = async () => {
    const config = loadEnv();
    if (!config.QUEUE_ENABLED) throw new Error("QUEUE_ENABLED=true is required for the worker");
    await mongoose.connect(config.MONGO_URL);
    await scheduleRecurringJobs();
    const worker = new Worker("saas-jobs", Jobs.processJob, { connection: { url: config.REDIS_URL } });
    worker.on("failed", (job, err) => console.error(JSON.stringify({ level: "error", job: job?.name, message: err.message })));
    const shutdown = async () => { await worker.close(); await mongoose.disconnect(); process.exit(0); };
    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);
};
start().catch((err) => { console.error(err.message); process.exitCode = 1; });
