const { getPasswordErrors } = require("../src/utils/password");
const { generateToken, hashToken } = require("../src/utils/tokens");
const { validateEnv } = require("../src/config/env");
const Email = require("../src/Services/Email.Service");

const baseEnv = {
    MONGO_URL: "mongodb://localhost:27017/test",
    SECRET_JWT: "a-secure-test-secret-that-is-over-32-characters"
};

describe("account security primitives", () => {
    test("password rules reject short, common, and weak passwords", () => {
        expect(getPasswordErrors("password123").length).toBeGreaterThan(0);
        expect(getPasswordErrors("alllowercase9").length).toBeGreaterThan(0);
        expect(getPasswordErrors("SecurePassphrase9")).toEqual([]);
    });

    test("opaque tokens are high entropy and stored hashes are deterministic", () => {
        const first = generateToken();
        const second = generateToken();
        expect(first).not.toBe(second);
        expect(first.length).toBeGreaterThan(50);
        expect(hashToken(first)).toMatch(/^[a-f0-9]{64}$/);
        expect(hashToken(first)).not.toBe(first);
    });

    test("Resend configuration requires an API key", () => {
        expect(() => validateEnv({ ...baseEnv, EMAIL_PROVIDER: "resend" })).toThrow(/RESEND_API_KEY/);
        expect(validateEnv({ ...baseEnv, EMAIL_PROVIDER: "resend", RESEND_API_KEY: "configured-by-deployment" }).EMAIL_PROVIDER).toBe("resend");
    });

    test("mock email transport produces HTML without exposing the recipient name unsafely", async () => {
        Email.resetEmailOutbox();
        await Email.sendVerification({ name: "<script>alert(1)</script>", email: "safe@example.com" }, "test-token");
        expect(Email.outbox[0].html).toContain("&lt;script&gt;");
        expect(Email.outbox[0].html).not.toContain("<script>alert");
        expect(Email.outbox[0].token).toBe("test-token");
    });
});
