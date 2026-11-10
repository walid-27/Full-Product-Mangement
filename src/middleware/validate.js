const AppError = require("../utils/AppError");

const validate = (schemas) => (req, res, next) => {
    try {
        for (const key of ["params", "query", "body"]) {
            const schema = schemas[key];
            if (!schema) continue;

            const result = schema.safeParse(req[key]);
            if (!result.success) {
                throw new AppError("Request validation failed", 422, "VALIDATION_ERROR", result.error.issues.map((issue) => ({
                    path: issue.path.join("."),
                    message: issue.message
                })));
            }

            if (key === "body") req.body = result.data;
        }
        return next();
    } catch (err) {
        return next(err);
    }
};

module.exports = validate;
