const express = require('express');
const orders = require("../Controllers/Orders.Controller")
const AuthMiddleware = require('../middleware/AuthMiddleware')
const router = express.Router();


router.post("/",
    AuthMiddleware,
    orders.createOrder )

router.get("/",
    AuthMiddleware,
    orders.getAllOrder )

router.get("/:id",
    AuthMiddleware,
    orders.getOrderById )

router.patch("/status/:id",
    AuthMiddleware,
    orders.updateOrderStatus )

router.patch("/cancel-order/:id",
    AuthMiddleware,
    orders.CancelOrder )

module.exports = router