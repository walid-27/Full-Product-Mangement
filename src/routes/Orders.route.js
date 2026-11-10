const express = require("express");
const orders = require("../Controllers/Orders.Controller");
const AuthMiddleware = require("../middleware/AuthMiddleware");
const resolveTenant = require("../middleware/TenantMiddleware");
const requireRole = require("../middleware/requireRole");
const validate = require("../middleware/validate");
const schemas = require("../validation/schemas");

const router = express.Router();
const writeAccess = requireRole("owner", "admin", "staff");
router.use(AuthMiddleware, resolveTenant);
router.post("/", writeAccess, validate(schemas.order.create), orders.createOrder);
router.get("/", validate(schemas.order.list), orders.getAllOrder);
router.get("/:id", validate(schemas.order.byId), orders.getOrderById);
router.patch("/status/:id", writeAccess, validate(schemas.order.updateStatus), orders.updateOrderStatus);
router.patch("/cancel-order/:id", writeAccess, validate(schemas.order.byId), orders.CancelOrder);
router.delete("/:id", writeAccess, validate(schemas.order.byId), orders.deleteOrder);
router.post("/:id/restore", writeAccess, validate(schemas.order.byId), orders.restoreOrder);

module.exports = router;
