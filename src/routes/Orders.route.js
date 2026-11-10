const express = require("express");
const orders = require("../Controllers/Orders.Controller");
const AuthMiddleware = require("../middleware/AuthMiddleware");
const validate = require("../middleware/validate");
const schemas = require("../validation/schemas");

const router = express.Router();

router.post("/", AuthMiddleware, validate(schemas.order.create), orders.createOrder);
router.get("/", AuthMiddleware, validate(schemas.order.list), orders.getAllOrder);
router.get("/:id", AuthMiddleware, validate(schemas.order.byId), orders.getOrderById);
router.patch("/status/:id", AuthMiddleware, validate(schemas.order.updateStatus), orders.updateOrderStatus);
router.patch("/cancel-order/:id", AuthMiddleware, validate(schemas.order.byId), orders.CancelOrder);

module.exports = router;
