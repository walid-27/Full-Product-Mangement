const Sentry = require("@sentry/node");
const client = require("prom-client");

const register = new client.Registry();
client.collectDefaultMetrics({ register });
const requests = new client.Counter({ name: "http_requests_total", help: "HTTP requests", labelNames: ["method", "route", "status"], registers: [register] });
const initObservability = (config) => {
    if (config.SENTRY_DSN) Sentry.init({ dsn: config.SENTRY_DSN, environment: config.NODE_ENV });
};
const metricsMiddleware = (req, res, next) => {
    res.on("finish", () => requests.inc({ method: req.method, route: req.route?.path || req.path, status: res.statusCode }));
    next();
};
const metricsHandler = async (req, res) => {
    res.set("Content-Type", register.contentType);
    res.send(await register.metrics());
};

module.exports = { initObservability, metricsMiddleware, metricsHandler, Sentry };
