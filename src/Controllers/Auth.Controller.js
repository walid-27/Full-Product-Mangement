const AuthServices = require("../Services/Auth.Service");
const Account = require("../Services/Account.Service");

const cookieOptions = () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/auth",
    maxAge: 30 * 24 * 60 * 60 * 1000
});
const sendAuth = (res, status, result, message) => {
    const { refreshToken, ...body } = result;
    res.cookie("refreshToken", refreshToken, cookieOptions());
    return res.status(status).json({ message, register: body });
};

const register = async (req, res, next) => {
    try {
        const result = await AuthServices.register(req.body);
        return sendAuth(res, 201, result, "Registration successful; verify your email");
    } catch (err) { return next(err); }
};
const login = async (req, res, next) => {
    try {
        const result = await AuthServices.login(req.body);
        return sendAuth(res, 200, result, "Login successful");
    } catch (err) { return next(err); }
};
const refresh = async (req, res, next) => {
    try {
        const result = await AuthServices.refresh(req.cookies.refreshToken);
        return sendAuth(res, 200, result, "Token refreshed");
    } catch (err) { return next(err); }
};
const logout = async (req, res, next) => {
    try {
        await AuthServices.logout(req.cookies.refreshToken);
        res.clearCookie("refreshToken", cookieOptions());
        return res.status(204).send();
    } catch (err) { return next(err); }
};
const logoutAll = async (req, res, next) => {
    try {
        await AuthServices.logoutAll(req.user.userId);
        res.clearCookie("refreshToken", cookieOptions());
        return res.status(204).send();
    } catch (err) { return next(err); }
};
const verifyEmail = async (req, res, next) => {
    try {
        await Account.verifyEmail(req.body.token);
        return res.status(200).json({ message: "Email verified" });
    } catch (err) { return next(err); }
};
const resendVerification = async (req, res, next) => {
    try {
        await Account.resendVerification(req.user.userId);
        return res.status(202).json({ message: "If verification is required, an email has been sent" });
    } catch (err) { return next(err); }
};
const forgotPassword = async (req, res, next) => {
    try {
        await Account.forgotPassword(req.body.email);
        return res.status(202).json({ message: "If the account exists, a reset email has been sent" });
    } catch (err) { return next(err); }
};
const resetPassword = async (req, res, next) => {
    try {
        await Account.resetPassword(req.body.token, req.body.password);
        return res.status(200).json({ message: "Password reset successful" });
    } catch (err) { return next(err); }
};

module.exports = {
    register, login, refresh, logout, logoutAll,
    verifyEmail, resendVerification, forgotPassword, resetPassword
};
