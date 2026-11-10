class AppError extends Error {
    constructor(message, statusCode, code = "REQUEST_ERROR", details) {
        super(message);
        this.name = "AppError";
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
        this.isOperational = true;
    }
}

module.exports = AppError;
