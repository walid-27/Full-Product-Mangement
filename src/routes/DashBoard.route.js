const express = require("express");
const AuthMiddleware = require("../middleware/AuthMiddleware");
const resolveTenant = require("../middleware/TenantMiddleware");
const Dashboard = require("../Controllers/Dashboard.Controller");
const validate = require("../middleware/validate");
const schemas = require("../validation/schemas");

const router = express.Router();
router.use(AuthMiddleware, resolveTenant);
router.get("/product", validate(schemas.dashboard.products), Dashboard.AnalysisProduct);
router.get("/order", validate(schemas.dashboard.orders), Dashboard.AnalysisOrder);

module.exports = router;
