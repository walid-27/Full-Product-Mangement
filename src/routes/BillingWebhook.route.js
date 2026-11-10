const express = require("express");
const Billing = require("../Controllers/Billing.Controller");

const router = express.Router();
router.post("/", express.raw({ type: "application/json", limit: "256kb" }), Billing.webhook);

module.exports = router;
