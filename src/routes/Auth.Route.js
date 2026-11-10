const express = require("express");
const Auth = require("../Controllers/Auth.Controller");
const AuthMiddleware = require("../middleware/AuthMiddleware");
const validate = require("../middleware/validate");
const schemas = require("../validation/schemas");

const router = express.Router();
router.post("/register", validate(schemas.auth.register), Auth.register);
router.post("/login", validate(schemas.auth.login), Auth.login);
router.post("/refresh", Auth.refresh);
router.post("/logout", Auth.logout);
router.post("/logout-all", AuthMiddleware, Auth.logoutAll);
router.post("/verify-email", validate(schemas.auth.token), Auth.verifyEmail);
router.post("/resend-verification", AuthMiddleware, Auth.resendVerification);
router.post("/forgot-password", validate(schemas.auth.forgot), Auth.forgotPassword);
router.post("/reset-password", validate(schemas.auth.reset), Auth.resetPassword);

module.exports = router;
