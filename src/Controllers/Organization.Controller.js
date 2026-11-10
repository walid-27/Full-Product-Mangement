const Organizations = require("../Services/Organization.Service");
const Audit = require("../Services/Audit.Service");

const wrap = (handler) => async (req, res, next) => {
    try {
        const result = await handler(req);
        return res.status(200).json(result);
    } catch (err) {
        return next(err);
    }
};

const listOrganizations = wrap((req) => Organizations.listOrganizations(req.user.userId));
const switchOrganization = wrap((req) => Organizations.switchOrganization(req.user.userId, req.body.organizationId));
const listMembers = wrap((req) => Organizations.listMembers(req.orgId));
const invite = async (req, res, next) => {
    try {
        const result = await Organizations.invite(req.orgId, req.body, {
            ...req.auditContext, actorRole: req.membership.role
        });
        return res.status(201).json(result);
    } catch (err) { return next(err); }
};
const acceptInvite = wrap((req) => Organizations.acceptInvite(req.user.userId, req.body.token, req.ip));
const changeRole = wrap((req) => Organizations.changeRole(req.orgId, req.params.id, req.body.role, {
    ...req.auditContext, actorRole: req.membership.role
}));
const removeMember = wrap((req) => Organizations.removeMember(req.orgId, req.params.id, {
    ...req.auditContext, actorRole: req.membership.role
}));
const leave = wrap((req) => Organizations.leave(req.orgId, req.membership._id, req.auditContext));
const deleteOrganization = wrap((req) => Organizations.deleteOrganization(req.orgId, req.auditContext));
const listAuditLogs = wrap((req) => Audit.list(req.orgId, req.query));

module.exports = {
    listOrganizations, switchOrganization, listMembers, invite, acceptInvite,
    changeRole, removeMember, leave, deleteOrganization, listAuditLogs
};
