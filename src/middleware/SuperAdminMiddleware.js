const Auth = require("../models/Auth");
const AppError = require("../utils/AppError");
module.exports = async (req, res, next) => {
    try {
        const user = await Auth.findOne({ _id: req.user.userId, isSuperAdmin: true }).lean();
        if (!user) throw new AppError("Super-admin access required", 403, "SUPER_ADMIN_REQUIRED");
        req.superAdmin = user;
        return next();
    } catch (err) { return next(err); }
};
