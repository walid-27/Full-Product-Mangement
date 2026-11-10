const AppError = require("../utils/AppError");

module.exports = (req, res, next) => {
    next(new AppError("Route not found", 404, "ROUTE_NOT_FOUND"));
};
