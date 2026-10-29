const express = require('express');
const inventroy = require("../Controllers/Inventory.Controller")
const AuthMiddleware = require('../middleware/AuthMiddleware')
const router = express.Router();


router.post("/:id",
     AuthMiddleware,
     inventroy.StockIn)


module.exports = router;