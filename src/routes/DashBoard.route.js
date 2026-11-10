const express = require("express");
const AuthMiddleware = require("../middleware/AuthMiddleware");
const Dashboard = require("../Controllers/Dashboard.Controller");

const router = express.Router();

router.use(AuthMiddleware);
router.get("/product", Dashboard.AnalysisProduct);
router.get("/order", Dashboard.AnalysisOrder);

module.exports = router;
