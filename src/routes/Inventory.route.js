const express = require("express");
const Inventory = require("../Controllers/Inventory.Controller");
const AuthMiddleware = require("../middleware/AuthMiddleware");
const resolveTenant = require("../middleware/TenantMiddleware");
const requireRole = require("../middleware/requireRole");
const validate = require("../middleware/validate");
const schemas = require("../validation/schemas");

const router = express.Router();
const writeAccess = requireRole("owner", "admin", "staff");
router.post("/stock-in/:id", AuthMiddleware, resolveTenant, writeAccess, validate(schemas.inventory.movement), Inventory.StockIn);
router.post("/stock-out/:id", AuthMiddleware, resolveTenant, writeAccess, validate(schemas.inventory.movement), Inventory.StockOut);
router.get("/low-stock", AuthMiddleware, resolveTenant, Inventory.stockAlert);
router.get("/out-stock", AuthMiddleware, resolveTenant, Inventory.OutStock);

module.exports = router;
