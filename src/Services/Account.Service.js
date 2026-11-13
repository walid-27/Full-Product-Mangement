const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const Auth = require("../models/Auth");
const AuthToken = require("../models/AuthToken");
const RefreshToken = require("../models/RefreshToken");
const Email = require("./Email.Service");
const AppError = require("../utils/AppError");
const { generateToken, hashToken } = require("../utils/tokens");
const { getPasswordErrors } = require("../utils/password");
const Analytics = require("./Analytics.Service");

const issueToken = async (user, type, ttlMs) => {
    const raw = generateToken();
    await AuthToken.updateMany({ user: user._id, type, usedAt: null }, { $set: { usedAt: new Date() } });
    await AuthToken.create({
        user: user._id, type, tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + ttlMs)
    });
    return raw;
};

/*
 * The token is already stored when delivery is attempted. A mail-provider
 * outage must never fail the surrounding request: registration would
 * otherwise report an error for an account that now exists (and a retry
 * then fails as a duplicate), and forgot-password would break its
 * non-enumerating 202 contract. The user can always request a fresh email.
 */
const deliverSafely = async (send) => {
    try {
        await send();
    } catch (error) {
        console.error(JSON.stringify({
            level: "error",
            msg: "Email delivery failed",
            code: (error && error.code) || "EMAIL_DELIVERY_FAILED",
            message: (error && error.message) || "unknown error"
        }));
    }
};

const sendVerification = async (user) => {
    const token = await issueToken(user, "email-verification", 24 * 60 * 60 * 1000);
    await deliverSafely(() => Email.sendVerification(user, token));
};

const verifyEmail = async (rawToken) => {
    const token = await AuthToken.findOneAndUpdate({
        type: "email-verification",
        tokenHash: hashToken(rawToken),
        usedAt: null,
        expiresAt: { $gt: new Date() }
    }, { $set: { usedAt: new Date() } }, { new: true });
    if (!token) throw new AppError("Verification link is invalid or expired", 400, "VERIFICATION_INVALID");
    await Auth.updateOne({ _id: token.user }, { $set: { emailVerifiedAt: new Date() } });
    await Analytics.track("activation", { user: token.user });
};

const resendVerification = async (userId) => {
    const user = await Auth.findById(userId);
    if (user && !user.emailVerifiedAt) await sendVerification(user);
};

const forgotPassword = async (email) => {
    const user = await Auth.findOne({ email });
    if (!user) return;
    const token = await issueToken(user, "password-reset", 60 * 60 * 1000);
    await deliverSafely(() => Email.sendPasswordReset(user, token));
};

const resetPassword = async (rawToken, password) => {
    const passwordErrors = getPasswordErrors(password);
    if (passwordErrors.length) throw new AppError("Password does not meet requirements", 422, "WEAK_PASSWORD", passwordErrors);
    const passwordHash = await bcrypt.hash(password, 12);
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const token = await AuthToken.findOneAndUpdate({
                type: "password-reset",
                tokenHash: hashToken(rawToken),
                usedAt: null,
                expiresAt: { $gt: new Date() }
            }, { $set: { usedAt: new Date() } }, { new: true, session });
            if (!token) throw new AppError("Reset link is invalid or expired", 400, "RESET_INVALID");
            await Auth.updateOne({ _id: token.user }, {
                $set: {
                    password: passwordHash,
                    passwordChangedAt: new Date(),
                    failedLoginAttempts: 0,
                    lockUntil: null,
                    emailVerifiedAt: new Date()
                }
            }, { session });
            await RefreshToken.updateMany({ user: token.user, revokedAt: null }, { $set: { revokedAt: new Date() } }, { session });
        });
    } finally {
        await session.endSession();
    }
};

const updateNotificationPreferences = async (userId, preferences) => {
    const user = await Auth.findById(userId);
    if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");
    Object.assign(user.notifications, preferences);
    await user.save();
    return user.notifications;
};

module.exports = { sendVerification, verifyEmail, resendVerification, forgotPassword, resetPassword, updateNotificationPreferences };
