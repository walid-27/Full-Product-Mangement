const mongoose = require("mongoose");
const { loadEnv } = require("./src/config/env");
const setDB = require("./src/utils/setDB");

const startServer = async () => {
    let config;
    try {
        config = loadEnv();
        const createLogger = require("./src/config/logger");
        const logger = createLogger(config);
        await setDB(config.MONGO_URL);
        const app = require("./app");
        const server = app.listen(config.PORT, "0.0.0.0", () => logger.info({ port: config.PORT }, "Server started"));
        if (config.QUEUE_ENABLED) await require("./src/jobs/queues").scheduleRecurringJobs();

        const shutdown = (signal) => {
            logger.info({ signal }, "Graceful shutdown started");
            server.close(async () => {
                await mongoose.disconnect();
                process.exit(0);
            });
            setTimeout(() => process.exit(1), 10000).unref();
        };
        process.on("SIGTERM", () => shutdown("SIGTERM"));
        process.on("SIGINT", () => shutdown("SIGINT"));
        return server;
    } catch (err) {
        console.error(err.message);
        process.exitCode = 1;
        return null;
    }
};

startServer();
