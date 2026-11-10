const express = require("express");
const AuthMiddleware = require("../middleware/AuthMiddleware");
const resolveTenant = require("../middleware/TenantMiddleware");
const Search = require("../Services/Search.Service");
const validate = require("../middleware/validate");
const { search } = require("../validation/schemas");
const router = express.Router();
router.get("/", AuthMiddleware, resolveTenant, validate(search), async (req, res, next) => {
    try { return res.status(200).json(await Search.search(req.orgId, req.query)); } catch (err) { return next(err); }
});
module.exports = router;
