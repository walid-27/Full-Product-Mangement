const express = require('express');
const router = express.Router();


const ProductControllers = require('../Controllers/Product.Controller')
const AuthMiddleware = require('../middleware/AuthMiddleware')
const upload = require("../middleware/upload");
const Validation = require('../middleware/validation');

router.use(AuthMiddleware)
router.post("/",
    upload.single("image"),
    Validation,
    ProductControllers.createProduct);


router.get("/", 
    
    ProductControllers.getProduct
    )

router.patch("/:id",
    upload.single("image"),
    ProductControllers.updateProduct);


router.delete("/:id",
        ProductControllers.deleteProduct
            )

router.get("/analysis",
    ProductControllers.analysisProducts
    )
module.exports = router;