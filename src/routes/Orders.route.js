const express = require('express');
const orders = require("../Controllers/Orders.Controller")
const AuthMiddleware = require('../middleware/AuthMiddleware')
const router = express.Router();


router.post("/",
    AuthMiddleware,
    orders.createOrder )

module.exports = router