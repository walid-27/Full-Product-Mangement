const express = require("express");
const Products = require("../Controllers/Product.Controller");
const AuthMiddleware = require("../middleware/AuthMiddleware");
const resolveTenant = require("../middleware/TenantMiddleware");
const requireRole = require("../middleware/requireRole");
const upload = require("../middleware/upload");
const validate = require("../middleware/validate");
const schemas = require("../validation/schemas");

const router = express.Router();
const writeAccess = requireRole("owner", "admin", "staff");
router.use(AuthMiddleware, resolveTenant);
router.post("/", writeAccess, upload.single("image"), validate(schemas.product.create), Products.createProduct);
router.get("/", validate(schemas.product.list), Products.getProduct);
router.get("/analysis", Products.analysisProducts);
router.patch("/:id", writeAccess, upload.single("image"), validate(schemas.product.update), Products.updateProduct);
router.delete("/:id", writeAccess, validate(schemas.product.byId), Products.deleteProduct);
router.post("/:id/restore", writeAccess, validate(schemas.product.byId), Products.restoreProduct);

module.exports = router;
