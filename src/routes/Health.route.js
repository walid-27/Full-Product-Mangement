const express = require("express");
const mongoose = require("mongoose");

const createHealthRouter = (isDatabaseReady = () => mongoose.connection.readyState === 1) => {
    const router = express.Router();

    router.get("/live", (req, res) => res.status(200).json({ status: "ok" }));
    router.get("/ready", (req, res) => res.status(isDatabaseReady() ? 200 : 503).json({ status: isDatabaseReady() ? "ok" : "unavailable" }));
    router.get("/", (req, res) => {
        const databaseReady = isDatabaseReady();
        return res.status(databaseReady ? 200 : 503).json({
            status: databaseReady ? "ok" : "unavailable",
            database: databaseReady ? "ready" : "unavailable",
            uptime: Math.floor(process.uptime())
        });
    });

    return router;
};

module.exports = createHealthRouter;
