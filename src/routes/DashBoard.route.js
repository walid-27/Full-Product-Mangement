const express = require('express');
const AuthMiddleware = require('../middleware/AuthMiddleware')
const router = express.Router();

const DashBoard = require("../Controllers/Dashboard.Controller")

router.use(AuthMiddleware)
router.get("/product", 
    DashBoard.AnalysisProduct
)

router.get("/order", 
    DashBoard.AnalysisOrder
)