const express = require("express");
const { register, login } = require("../Controllers/Auth.Controller");
const validate = require("../middleware/validate");
const schemas = require("../validation/schemas");

const router = express.Router();

router.post("/register", validate(schemas.auth.register), register);
router.post("/login", validate(schemas.auth.login), login);

module.exports = router;
