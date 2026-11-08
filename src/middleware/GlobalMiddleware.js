
function GlobalMiddleware(err, req, res, next) {
    // If the response was already sent, let Express handle the error
    if (res.headersSent) {
        return next(err);
    }

    if (err.statusCode) {
        return res.status(err.statusCode).json({
            message: err.message
        });
    }

    if (err.name === "ValidationError") {
        const errors = {};

        for (const field in err.errors) {
            errors[field] = err.errors[field].message;
        }

        return res.status(400).json({
            message: errors
        });
    }

    if (err.name === "CastError") {
        return res.status(400).json({
            message: "Error in search"
        });
    }

    return res.status(500).json({
        message: err.message || "Internal Server Error"
    });
}

module.exports = GlobalMiddleware;
