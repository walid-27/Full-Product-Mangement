const ApiKey = require("../models/ApiKey");
const AppError = require("../utils/AppError");
const { hashToken } = require("../utils/tokens");

const buckets = new Map();
const apiKeyAuth = (scope = "read") => async (req, res, next) => {
    try {
        const raw = req.get("x-api-key");
        if (!raw) throw new AppError("API key required", 401, "API_KEY_REQUIRED");
        const key = await ApiKey.findOne({ keyHash: hashToken(raw), revokedAt: null });
        if (!key || !key.scopes.includes(scope)) throw new AppError("Invalid or insufficient API key", 403, "API_KEY_FORBIDDEN");
        const now = Date.now();
        const bucket = buckets.get(key._id.toString()) || { start: now, count: 0 };
        if (now - bucket.start >= 60000) { bucket.start = now; bucket.count = 0; }
        bucket.count += 1;
        buckets.set(key._id.toString(), bucket);
        if (bucket.count > key.rateLimitPerMinute) throw new AppError("API key rate limit exceeded", 429, "RATE_LIMITED");
        req.orgId = key.organization.toString();
        req.apiKey = key;
        key.lastUsedAt = new Date();
        await key.save();
        return next();
    } catch (err) { return next(err); }
};
module.exports = apiKeyAuth;
