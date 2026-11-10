const express = require("express");
const AuthMiddleware = require("../middleware/AuthMiddleware");
const Gdpr = require("../Services/Gdpr.Service");
const Membership = require("../models/Membership");
const Account = require("../Services/Account.Service");
const validate = require("../middleware/validate");
const { account } = require("../validation/schemas");
const router = express.Router();
router.patch("/notifications", AuthMiddleware, validate(account.notifications), async (req, res, next) => { try { res.json(await Account.updateNotificationPreferences(req.user.userId, req.body)); } catch (err) { next(err); } });
router.get("/export", AuthMiddleware, async (req, res, next) => { try { res.json(await Gdpr.exportAccount(req.user.userId)); } catch (err) { next(err); } });
router.delete("/", AuthMiddleware, async (req, res, next) => { try { await Gdpr.scheduleAccountDeletion(req.user.userId); res.status(202).json({ message: "Account deletion scheduled in 30 days" }); } catch (err) { next(err); } });
router.get("/onboarding", AuthMiddleware, async (req, res, next) => {
    try {
        const memberships = await Membership.find({ user: req.user.userId, status: "active" }).lean();
        const organizationIds = memberships.map((membership) => membership.organization);
        const products = await require("../models/Product").countDocuments({ organization: { $in: organizationIds }, deletedAt: null });
        res.json({ checklist: [
            { step: "organization", complete: memberships.length > 0 },
            { step: "first-product", complete: products > 0 },
            { step: "team", complete: memberships.length > 0 }
        ] });
    } catch (err) { next(err); }
});
module.exports = router;
