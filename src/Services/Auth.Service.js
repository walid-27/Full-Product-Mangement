const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { randomUUID } = require("crypto");
const Auth = require("../models/Auth");
const Organization = require("../models/Organization");
const Membership = require("../models/Membership");
const RefreshToken = require("../models/RefreshToken");
const Subscription = require("../models/Subscription");
const AppError = require("../utils/AppError");
const Audit = require("./Audit.Service");
const Account = require("./Account.Service");
const { generateToken, hashToken } = require("../utils/tokens");
const { getPasswordErrors } = require("../utils/password");
const Analytics = require("./Analytics.Service");

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const DUMMY_HASH = "$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.";

const signAccessToken = (user, organizationId = null) => jwt.sign({
    userId: user._id.toString(),
    email: user.email,
    ...(organizationId ? { orgId: organizationId.toString() } : {})
}, process.env.SECRET_JWT, { expiresIn: "15m" });

const issueRefreshToken = async (userId, family = new mongoose.Types.ObjectId(), session = null) => {
    const raw = generateToken();
    const [token] = await RefreshToken.create([{
        user: userId,
        family,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + REFRESH_TTL_MS)
    }], { session });
    return { raw, token };
};

const authResponse = async (user, organization = null) => {
    const membership = organization ? null : await Membership.findOne({ user: user._id, status: "active" }).sort({ createdAt: 1 }).lean();
    const organizationId = organization?._id || membership?.organization;
    const refresh = await issueRefreshToken(user._id);
    return {
        name: user.name,
        email: user.email,
        emailVerified: Boolean(user.emailVerifiedAt),
        ...(organization ? { organization: { id: organization._id, name: organization.name, slug: organization.slug } } : {}),
        token: signAccessToken(user, organizationId),
        refreshToken: refresh.raw
    };
};

const register = async (data) => {
    const { name, email, password } = data;
    const passwordErrors = getPasswordErrors(password);
    if (passwordErrors.length) throw new AppError("Password does not meet requirements", 422, "WEAK_PASSWORD", passwordErrors);
    if (await Auth.exists({ email })) throw new AppError("Unable to register with these details", 409, "USER_EXISTS");

    const hashPassword = await bcrypt.hash(password, 12);
    const session = await mongoose.startSession();
    let user;
    let organization;
    try {
        await session.withTransaction(async () => {
            [user] = await Auth.create([{ name, email, password: hashPassword, emailVerifiedAt: null }], { session });
            [organization] = await Organization.create([{ name: `${name}'s Organization`, slug: `org-${randomUUID()}`, plan: "pro" }], { session });
            await Subscription.create([{
                organization: organization._id,
                plan: "pro",
                status: "trialing",
                trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
            }], { session });
            const [membership] = await Membership.create([{ user: user._id, organization: organization._id, role: "owner", status: "active" }], { session });
            await Audit.record({ organization: organization._id, actor: user._id, action: "organization.create", entity: "organization", entityId: organization._id, after: organization }, session);
            await Audit.record({ organization: organization._id, actor: user._id, action: "team.owner.create", entity: "membership", entityId: membership._id, after: membership }, session);
        });
    } finally {
        await session.endSession();
    }
    await Account.sendVerification(user);
    await Analytics.track("signup", { organization: organization._id, user: user._id });
    return authResponse(user, organization);
};

const login = async (data) => {
    const { email, password } = data;
    const user = await Auth.findOne({ email });
    if (!user) {
        await bcrypt.compare(password, DUMMY_HASH);
        throw new AppError("The email or password is invalid", 401, "INVALID_CREDENTIALS");
    }
    if (user.lockUntil && user.lockUntil > new Date()) {
        throw new AppError("Account is temporarily locked", 429, "ACCOUNT_LOCKED");
    }
    if (!await bcrypt.compare(password, user.password)) {
        user.failedLoginAttempts += 1;
        if (user.failedLoginAttempts >= 5) user.lockUntil = new Date(Date.now() + 15 * 60 * 1000);
        await user.save();
        throw new AppError("The email or password is invalid", 401, "INVALID_CREDENTIALS");
    }
    user.failedLoginAttempts = 0;
    user.lockUntil = null;
    await user.save();
    return authResponse(user);
};

const refresh = async (rawToken) => {
    if (!rawToken) throw new AppError("Refresh token is required", 401, "REFRESH_REQUIRED");
    const existing = await RefreshToken.findOne({ tokenHash: hashToken(rawToken) });
    if (!existing) throw new AppError("Invalid refresh token", 401, "INVALID_REFRESH");
    if (existing.revokedAt) {
        await RefreshToken.updateMany({ family: existing.family, revokedAt: null }, { $set: { revokedAt: new Date() } });
        throw new AppError("Refresh token reuse detected", 401, "REFRESH_REUSE");
    }
    if (existing.expiresAt <= new Date()) throw new AppError("Refresh token expired", 401, "INVALID_REFRESH");

    const session = await mongoose.startSession();
    try {
        return await session.withTransaction(async () => {
            const revoked = await RefreshToken.findOneAndUpdate({
                _id: existing._id, revokedAt: null
            }, { $set: { revokedAt: new Date() } }, { new: true, session });
            if (!revoked) {
                await RefreshToken.updateMany({ family: existing.family, revokedAt: null }, { $set: { revokedAt: new Date() } }, { session });
                throw new AppError("Refresh token reuse detected", 401, "REFRESH_REUSE");
            }
            const rotated = await issueRefreshToken(existing.user, existing.family, session);
            revoked.replacedBy = rotated.token._id;
            await revoked.save({ session });
            const user = await Auth.findById(existing.user).session(session);
            if (!user) throw new AppError("Invalid refresh token", 401, "INVALID_REFRESH");
            const membership = await Membership.findOne({ user: user._id, status: "active" }).sort({ createdAt: 1 }).session(session).lean();
            return {
                name: user.name, email: user.email, emailVerified: Boolean(user.emailVerifiedAt),
                token: signAccessToken(user, membership?.organization), refreshToken: rotated.raw
            };
        });
    } finally {
        await session.endSession();
    }
};

const logout = async (rawToken) => {
    if (rawToken) await RefreshToken.updateOne({ tokenHash: hashToken(rawToken), revokedAt: null }, { $set: { revokedAt: new Date() } });
};
const logoutAll = async (userId) => {
    await RefreshToken.updateMany({ user: userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
};

module.exports = { register, login, refresh, logout, logoutAll, signAccessToken };
