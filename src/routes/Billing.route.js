const express = require("express");
const Billing = require("../Controllers/Billing.Controller");
const AuthMiddleware = require("../middleware/AuthMiddleware");
const resolveTenant = require("../middleware/TenantMiddleware");
const requireRole = require("../middleware/requireRole");
const validate = require("../middleware/validate");
const schemas = require("../validation/schemas");

const router = express.Router();
router.use(AuthMiddleware, resolveTenant, requireRole("owner"));
router.get("/subscription", Billing.subscription);
router.get("/usage", Billing.usage);
router.post("/checkout", validate(schemas.billing.checkout), Billing.checkout);
router.post("/portal", Billing.portal);
router.post("/cancel", Billing.cancel);
router.get("/invoices", validate(schemas.billing.invoices), Billing.invoices);

module.exports = router;
