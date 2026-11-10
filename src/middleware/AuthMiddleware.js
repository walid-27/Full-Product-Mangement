const jwt = require("jsonwebtoken");
const AppError = require("../utils/AppError");

function AuthMiddleware(req, res, next) {
    const authorization = req.headers.authorization;
    if (!authorization) {
        return next(new AppError("Authentication required", 401, "AUTH_REQUIRED"));
    }

    const [scheme, token] = authorization.split(" ");
    if (scheme !== "Bearer" || !token) {
        return next(new AppError("Invalid authorization header", 401, "INVALID_TOKEN"));
    }

    try {
        req.user = jwt.verify(token, process.env.SECRET_JWT);
        return next();
    } catch (err) {
        return next(err);
    }
}

module.exports = AuthMiddleware;
