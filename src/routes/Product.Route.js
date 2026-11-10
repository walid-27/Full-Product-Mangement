const express = require("express");
const ProductControllers = require("../Controllers/Product.Controller");
const AuthMiddleware = require("../middleware/AuthMiddleware");
const upload = require("../middleware/upload");
const validate = require("../middleware/validate");
const schemas = require("../validation/schemas");

const router = express.Router();

router.use(AuthMiddleware);
router.post("/", upload.single("image"), validate(schemas.product.create), ProductControllers.createProduct);
router.get("/", validate(schemas.product.list), ProductControllers.getProduct);
router.get("/analysis", ProductControllers.analysisProducts);
router.patch("/:id", upload.single("image"), validate(schemas.product.update), ProductControllers.updateProduct);
router.delete("/:id", validate(schemas.product.byId), ProductControllers.deleteProduct);

module.exports = router;
