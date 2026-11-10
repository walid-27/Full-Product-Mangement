const express = require("express");
const Inventory = require("../Controllers/Inventory.Controller");
const AuthMiddleware = require("../middleware/AuthMiddleware");
const validate = require("../middleware/validate");
const schemas = require("../validation/schemas");

const router = express.Router();

router.post("/stock-in/:id", AuthMiddleware, validate(schemas.inventory.movement), Inventory.StockIn);
router.post("/stock-out/:id", AuthMiddleware, validate(schemas.inventory.movement), Inventory.StockOut);
router.get("/low-stock", AuthMiddleware, Inventory.stockAlert);
router.get("/out-stock", AuthMiddleware, Inventory.OutStock);

module.exports = router;
