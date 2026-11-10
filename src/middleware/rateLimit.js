const { rateLimit } = require("express-rate-limit");

const rateLimitHandler = (req, res) => res.status(429).json({
    code: "RATE_LIMITED",
    message: "Too many requests; please try again later"
});

const createRateLimiter = ({ windowMs, max }) => rateLimit({
    windowMs,
    limit: max,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: rateLimitHandler
});

module.exports = createRateLimiter;
