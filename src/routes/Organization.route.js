const express = require("express");
const Organizations = require("../Controllers/Organization.Controller");
const AuthMiddleware = require("../middleware/AuthMiddleware");
const resolveTenant = require("../middleware/TenantMiddleware");
const requireRole = require("../middleware/requireRole");
const validate = require("../middleware/validate");
const schemas = require("../validation/schemas");

const router = express.Router();

router.get("/", AuthMiddleware, Organizations.listOrganizations);
router.post("/switch", AuthMiddleware, validate(schemas.organization.switch), Organizations.switchOrganization);
router.post("/invites/accept", AuthMiddleware, validate(schemas.organization.acceptInvite), Organizations.acceptInvite);

router.use(AuthMiddleware, resolveTenant);
router.get("/members", Organizations.listMembers);
router.post("/invites", requireRole("owner", "admin"), validate(schemas.organization.invite), Organizations.invite);
router.patch("/members/:id/role", requireRole("owner", "admin"), validate(schemas.organization.changeRole), Organizations.changeRole);
router.delete("/members/:id", requireRole("owner", "admin"), validate(schemas.organization.byId), Organizations.removeMember);
router.post("/leave", Organizations.leave);
router.delete("/", requireRole("owner"), Organizations.deleteOrganization);
router.get("/audit-logs", requireRole("owner", "admin"), validate(schemas.organization.audit), Organizations.listAuditLogs);

module.exports = router;
