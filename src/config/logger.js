const pino = require("pino");

const createLogger = (config, destination) => pino({
    level: config.LOG_LEVEL,
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: {
        paths: [
            "req.headers.authorization",
            "req.headers.cookie",
            "req.body.password",
            "req.body.token",
            "req.body.refreshToken",
            "response.headers.set-cookie"
        ],
        censor: "[Redacted]"
    }
}, destination);

module.exports = createLogger;
