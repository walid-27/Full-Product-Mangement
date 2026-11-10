const express = require("express");
const Inventory = require("../Controllers/Inventory.Controller");
const AuthMiddleware = require("../middleware/AuthMiddleware");

const router = express.Router();

router.post("/stock-in/:id", AuthMiddleware, Inventory.StockIn);
router.post("/stock-out/:id", AuthMiddleware, Inventory.StockOut);
router.get("/low-stock", AuthMiddleware, Inventory.stockAlert);
router.get("/out-stock", AuthMiddleware, Inventory.OutStock);

module.exports = router;
