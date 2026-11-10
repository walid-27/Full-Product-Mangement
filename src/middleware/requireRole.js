const AppError = require("../utils/AppError");

const requireRole = (...roles) => (req, res, next) => {
    if (!req.membership || !roles.includes(req.membership.role)) {
        return next(new AppError("Your role does not allow this action", 403, "ROLE_FORBIDDEN"));
    }
    return next();
};

module.exports = requireRole;
