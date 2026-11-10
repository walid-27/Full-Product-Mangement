const { loadEnv } = require("../config/env");
const AppError = require("../utils/AppError");

const outbox = [];
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);
const template = (title, name, actionUrl, actionLabel) => `
    <html><body><h1>${title}</h1><p>Hello ${escapeHtml(name)},</p>
    <p><a href="${actionUrl}">${actionLabel}</a></p>
    <p>This link expires soon. If you did not request it, you can ignore this email.</p></body></html>`;

const deliver = async (message) => {
    const config = loadEnv();
    if (config.EMAIL_PROVIDER === "mock") {
        outbox.push(message);
        return;
    }
    if (config.EMAIL_PROVIDER === "console") {
        console.log(JSON.stringify({ email: message }));
        return;
    }

    const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${config.RESEND_API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            from: config.EMAIL_FROM,
            to: [message.to],
            subject: message.subject,
            html: message.html
        }),
        signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) throw new AppError("Email delivery failed", 502, "EMAIL_DELIVERY_FAILED");
};

const sendVerification = async (user, token) => {
    const config = loadEnv();
    const url = `${config.APP_URL}/auth/verify-email?token=${encodeURIComponent(token)}`;
    await deliver({
        to: user.email, subject: "Verify your email", token,
        html: template("Verify your email", user.name, url, "Verify email")
    });
};

const sendPasswordReset = async (user, token) => {
    const config = loadEnv();
    const url = `${config.APP_URL}/auth/reset-password?token=${encodeURIComponent(token)}`;
    await deliver({
        to: user.email, subject: "Reset your password", token,
        html: template("Reset your password", user.name, url, "Reset password")
    });
};

const resetEmailOutbox = () => { outbox.length = 0; };

module.exports = { sendVerification, sendPasswordReset, resetEmailOutbox, outbox };
