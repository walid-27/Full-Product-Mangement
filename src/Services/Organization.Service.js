const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { createHash } = require("crypto");
const Auth = require("../models/Auth");
const Organization = require("../models/Organization");
const Membership = require("../models/Membership");
const OrganizationInvite = require("../models/OrganizationInvite");
const AppError = require("../utils/AppError");
const Audit = require("./Audit.Service");
const { signAccessToken } = require("./Auth.Service");
const Plans = require("./Plan.Service");

const hashToken = (token) => createHash("sha256").update(token).digest("hex");
const getMembership = (organization, membershipId) => Membership.findOne({ _id: membershipId, organization });
const ensureNotLastOwner = async (organization, membership) => {
    if (membership.role !== "owner") return;
    const owners = await Membership.countDocuments({ organization, role: "owner", status: "active" });
    if (owners <= 1) throw new AppError("An organization must retain at least one owner", 409, "LAST_OWNER");
};

const listOrganizations = async (userId) => {
    const memberships = await Membership.find({ user: userId, status: "active" })
        .populate({ path: "organization", match: { status: "active" }, select: "name slug plan status" })
        .sort({ createdAt: 1 })
        .lean();
    return memberships.filter((membership) => membership.organization).map((membership) => ({
        id: membership.organization._id,
        name: membership.organization.name,
        slug: membership.organization.slug,
        plan: membership.organization.plan,
        role: membership.role
    }));
};

const switchOrganization = async (userId, organizationId) => {
    const [user, membership] = await Promise.all([
        Auth.findById(userId),
        Membership.findOne({ user: userId, organization: organizationId, status: "active" }).populate({
            path: "organization", match: { status: "active" }
        })
    ]);
    if (!user || !membership?.organization) {
        throw new AppError("You do not have access to this organization", 403, "ORGANIZATION_FORBIDDEN");
    }
    return { token: signAccessToken(user, organizationId), organization: membership.organization };
};

const listMembers = async (organization) => Membership.find({ organization, status: "active" })
    .populate("user", "name email")
    .sort({ createdAt: 1 })
    .lean();

const invite = async (organization, data, context) => {
    await Plans.assertTeamInvite(organization);
    if (data.role === "owner" && context.actorRole !== "owner") {
        throw new AppError("Only an owner can invite another owner", 403, "ROLE_FORBIDDEN");
    }
    const email = data.email.toLowerCase();
    const user = await Auth.findOne({ email });
    if (user && await Membership.exists({ organization, user: user._id, status: "active" })) {
        throw new AppError("This user is already a member", 409, "MEMBER_EXISTS");
    }
    if (await OrganizationInvite.exists({ organization, email, acceptedAt: null, expiresAt: { $gt: new Date() } })) {
        throw new AppError("An active invitation already exists", 409, "INVITE_EXISTS");
    }

    const invitationId = new mongoose.Types.ObjectId();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const token = jwt.sign({ type: "organization-invite", email }, process.env.SECRET_JWT, {
        expiresIn: "7d",
        jwtid: invitationId.toString(),
        subject: organization.toString()
    });
    const invitation = await OrganizationInvite.create({
        _id: invitationId,
        organization,
        email,
        role: data.role,
        invitedBy: context.actor,
        tokenHash: hashToken(token),
        expiresAt
    });
    await Audit.record({
        organization, ...context, action: "team.invite", entity: "organizationInvite",
        entityId: invitation._id, after: { email, role: invitation.role, expiresAt: invitation.expiresAt }
    });

    return { invitation: { id: invitation._id, email, role: invitation.role, expiresAt: invitation.expiresAt }, token };
};

const acceptInvite = async (userId, token, ip) => {
    let payload;
    try {
        payload = jwt.verify(token, process.env.SECRET_JWT);
    } catch (err) {
        throw new AppError("Invitation is invalid or expired", 400, "INVITE_INVALID");
    }
    if (payload.type !== "organization-invite" || !payload.jti) {
        throw new AppError("Invitation is invalid or expired", 400, "INVITE_INVALID");
    }

    const [user, invitation] = await Promise.all([
        Auth.findById(userId),
        OrganizationInvite.findOne({ _id: payload.jti, tokenHash: hashToken(token), acceptedAt: null })
    ]);
    if (!invitation || invitation.expiresAt <= new Date() || !user || user.email !== invitation.email) {
        throw new AppError("Invitation is invalid, expired, or addressed to another user", 400, "INVITE_INVALID");
    }
    if (!await Organization.exists({ _id: invitation.organization, status: "active" })) {
        throw new AppError("Organization is not active", 403, "ORGANIZATION_FORBIDDEN");
    }

    const session = await mongoose.startSession();
    try {
        return await session.withTransaction(async () => {
            const membership = await Membership.findOneAndUpdate({
                user: user._id,
                organization: invitation.organization
            }, {
                $set: { role: invitation.role, status: "active" }
            }, { new: true, upsert: true, runValidators: true, session });
            const acceptedInvitation = await OrganizationInvite.findOneAndUpdate({
                _id: invitation._id,
                acceptedAt: null,
                expiresAt: { $gt: new Date() }
            }, { $set: { acceptedAt: new Date() } }, { new: true, session });
            if (!acceptedInvitation) throw new AppError("Invitation was already used", 409, "INVITE_USED");
            await Audit.record({
                organization: invitation.organization, actor: user._id, ip,
                action: "team.invite.accept", entity: "membership", entityId: membership._id,
                after: membership
            }, session);
            return { organization: invitation.organization, role: membership.role };
        });
    } finally {
        await session.endSession();
    }
};

const changeRole = async (organization, membershipId, role, context) => {
    const membership = await getMembership(organization, membershipId);
    if (!membership) throw new AppError("Membership not found", 404, "MEMBERSHIP_NOT_FOUND");
    if ((membership.role === "owner" || role === "owner") && context.actorRole !== "owner") {
        throw new AppError("Only an owner can manage owner roles", 403, "ROLE_FORBIDDEN");
    }
    await ensureNotLastOwner(organization, membership);
    const before = membership.toObject();
    membership.role = role;
    await membership.save();
    await Audit.record({
        organization, ...context, action: "team.role.change", entity: "membership",
        entityId: membership._id, before, after: membership
    });
    return membership;
};

const removeMember = async (organization, membershipId, context) => {
    const membership = await getMembership(organization, membershipId);
    if (!membership) throw new AppError("Membership not found", 404, "MEMBERSHIP_NOT_FOUND");
    if (membership.role === "owner" && context.actorRole !== "owner") {
        throw new AppError("Only an owner can remove an owner", 403, "ROLE_FORBIDDEN");
    }
    if (membership.user.toString() === context.actor.toString()) {
        throw new AppError("Use the leave organization endpoint", 409, "USE_LEAVE_ENDPOINT");
    }
    await ensureNotLastOwner(organization, membership);
    await Membership.deleteOne({ _id: membership._id, organization });
    await Audit.record({
        organization, ...context, action: "team.member.remove", entity: "membership",
        entityId: membership._id, before: membership
    });
};

const leave = async (organization, membershipId, context) => {
    const membership = await getMembership(organization, membershipId);
    if (!membership) throw new AppError("Membership not found", 404, "MEMBERSHIP_NOT_FOUND");
    await ensureNotLastOwner(organization, membership);
    await Membership.deleteOne({ _id: membership._id, organization });
    await Audit.record({
        organization, ...context, action: "team.member.leave", entity: "membership",
        entityId: membership._id, before: membership
    });
};

const deleteOrganization = async (organization, context) => {
    const existing = await Organization.findOne({ _id: organization, status: "active" });
    if (!existing) throw new AppError("Organization not found", 404, "ORGANIZATION_NOT_FOUND");
    existing.status = "deleted";
    await existing.save();
    await Membership.updateMany({ organization }, { $set: { status: "suspended" } });
    await Audit.record({
        organization, ...context, action: "organization.delete", entity: "organization",
        entityId: organization, before: { status: "active" }, after: { status: "deleted" }
    });
};

module.exports = {
    listOrganizations, switchOrganization, listMembers, invite, acceptInvite,
    changeRole, removeMember, leave, deleteOrganization
};
