const AuthServices = require("../Services/Auth.Service");
const Account = require("../Services/Account.Service");

const cookieOptions = () => ({
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
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

/* ------------------------------------------------------- browser pages */
/*
 * The verification / reset emails link here (GET), while the API clients
 * use the POST endpoints above. Without these pages the emailed links
 * answered 404 and verification dead-ended.
 */

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
})[character]);

const page = (res, status, title, body) => {
    // Self-contained page: relax the API-wide CSP for this response only.
    res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'");
    return res.status(status).type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} · StockFlow</title>
<style>
  body { margin:0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; background:#0f1420; color:#e8ecf4; display:grid; place-items:center; min-height:100vh; }
  main { background:#171e2e; border:1px solid #26314d; border-radius:14px; padding:32px; max-width:420px; width:calc(100% - 48px); }
  h1 { font-size:20px; margin:0 0 10px; } p { color:#9aa7c2; line-height:1.6; font-size:14px; }
  label { display:block; font-size:13px; margin:14px 0 6px; color:#c6d0e4; }
  input { width:100%; box-sizing:border-box; padding:10px 12px; border-radius:8px; border:1px solid #33415f; background:#0f1420; color:#e8ecf4; }
  button { margin-top:18px; width:100%; padding:11px; border:0; border-radius:8px; background:#4f7cff; color:#fff; font-weight:600; cursor:pointer; }
  .error { color:#ff9c9c; } .ok { color:#8be0a4; }
</style></head><body><main>${body}</main></body></html>`);
};

const verifyEmailPage = async (req, res) => {
    const token = String((req.query && req.query.token) || "");
    if (token.length < 20 || token.length > 4096) {
        return page(res, 400, "Verification failed",
            `<h1>Verification failed</h1><p class="error">This verification link is invalid. Open the app and request a new verification email.</p>`);
    }
    try {
        await Account.verifyEmail(token);
        return page(res, 200, "Email verified",
            `<h1 class="ok">Email verified</h1><p>Your email is confirmed. You can close this tab and sign in to StockFlow — your workspace is unlocked.</p>`);
    } catch (err) {
        return page(res, 400, "Verification failed",
            `<h1>Verification failed</h1><p class="error">${escapeHtml(err.message || "This verification link is invalid or expired.")}</p><p>Open the app and request a new verification email.</p>`);
    }
};

const resetPasswordPage = (req, res) => {
    const token = String((req.query && req.query.token) || "");
    if (token.length < 20 || token.length > 4096) {
        return page(res, 400, "Reset link invalid",
            `<h1>Reset link invalid</h1><p class="error">This password-reset link is invalid. Request a new one from the app.</p>`);
    }
    // The token is NOT consumed here — only the form submission (POST) uses it.
    return page(res, 200, "Set a new password", `
        <h1>Set a new password</h1>
        <p>12+ characters with uppercase, lowercase and a number.</p>
        <form id="reset-form">
          <label for="password">New password</label>
          <input id="password" type="password" autocomplete="new-password" required />
          <label for="confirm">Confirm password</label>
          <input id="confirm" type="password" autocomplete="new-password" required />
          <button type="submit">Reset password</button>
          <p id="result" role="status"></p>
        </form>
        <script>
          document.getElementById('reset-form').addEventListener('submit', async (event) => {
            event.preventDefault();
            const result = document.getElementById('result');
            const password = document.getElementById('password').value;
            if (password !== document.getElementById('confirm').value) {
              result.className = 'error'; result.textContent = 'The two passwords do not match.'; return;
            }
            try {
              const response = await fetch('reset-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: ${JSON.stringify(token)}, password })
              });
              const data = await response.json().catch(() => ({}));
              if (!response.ok) throw new Error(data.message || 'Reset failed');
              result.className = 'ok';
              result.textContent = 'Password reset. You can close this tab and sign in with your new password.';
            } catch (error) {
              result.className = 'error'; result.textContent = error.message;
            }
          });
        </script>`);
};

module.exports = {
    register, login, refresh, logout, logoutAll,
    verifyEmail, resendVerification, forgotPassword, resetPassword,
    verifyEmailPage, resetPasswordPage
};
