const express = require('express');
const inventroy = require("../Controllers/Inventory.Controller")
const AuthMiddleware = require('../middleware/AuthMiddleware')
const router = express.Router();


router.post("/stock-in/:id",
     AuthMiddleware,
     inventroy.StockIn)

router.post("/stock-out/:id",
     AuthMiddleware,
     inventroy.StockOut)

     router.get("/low-stock",
     AuthMiddleware,
     inventroy.stockAlert)

     router.get("/out-stock",
     AuthMiddleware,
     inventroy.OutStock)

module.exports = router;