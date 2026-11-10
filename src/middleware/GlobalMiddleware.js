const normalizeError = (err) => {
    if (err.name === "ValidationError") {
        return {
            statusCode: 422,
            code: "VALIDATION_ERROR",
            message: "Request validation failed",
            details: Object.entries(err.errors || {}).map(([path, error]) => ({
                path,
                message: error.message
            }))
        };
    }

    if (err.name === "CastError") {
        return { statusCode: 400, code: "INVALID_ID", message: "Invalid resource identifier" };
    }

    if (err.code === 11000) {
        return { statusCode: 409, code: "DUPLICATE_RESOURCE", message: "Resource already exists" };
    }

    if (err.type === "entity.parse.failed") {
        return { statusCode: 400, code: "INVALID_JSON", message: "Malformed JSON request body" };
    }

    if (err.type === "entity.too.large") {
        return { statusCode: 413, code: "PAYLOAD_TOO_LARGE", message: "Request body is too large" };
    }

    if (err.name === "JsonWebTokenError" || err.name === "TokenExpiredError" || err.name === "NotBeforeError") {
        return { statusCode: 401, code: "INVALID_TOKEN", message: "Invalid or expired access token" };
    }

    return {
        statusCode: err.statusCode || err.status || 500,
        code: err.code && typeof err.code === "string" ? err.code : "INTERNAL_ERROR",
        message: err.message,
        details: err.details
    };
};

function GlobalMiddleware(err, req, res, next) {
    if (res.headersSent) return next(err);

    const normalized = normalizeError(err);
    const isProduction = req.app.get("env") === "production";
    const isServerError = normalized.statusCode >= 500;

    if (req.log) {
        const log = isServerError ? req.log.error.bind(req.log) : req.log.warn.bind(req.log);
        log({ err, statusCode: normalized.statusCode }, "Request failed");
    }

    return res.status(normalized.statusCode).json({
        code: isServerError ? "INTERNAL_ERROR" : normalized.code,
        message: isServerError && isProduction
            ? "Internal Server Error"
            : normalized.message || "Internal Server Error",
        ...(normalized.details && !isServerError ? { details: normalized.details } : {})
    });
}

module.exports = GlobalMiddleware;
