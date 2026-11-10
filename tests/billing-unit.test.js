const { PLANS, withinLimit } = require("../src/config/plans");
const { signatureFor } = require("../src/Services/payments/ChargilyProvider");
const { validateEnv } = require("../src/config/env");
const Plans = require("../src/Services/Plan.Service");

const baseEnv = {
    MONGO_URL: "mongodb://localhost:27017/test",
    SECRET_JWT: "a-secure-test-secret-that-is-over-32-characters"
};

describe("billing configuration and webhook security", () => {
    test("plans expose limits and paid feature flags", () => {
        expect(PLANS.free.maxProducts).toBe(25);
        expect(PLANS.free.features.reports).toBe(false);
        expect(PLANS.pro.features.csvExport).toBe(true);
        expect(PLANS.business.maxOrdersPerMonth).toBeNull();
        expect(withinLimit(49, 50)).toBe(true);
        expect(withinLimit(50, 50)).toBe(false);
        expect(withinLimit(100000, null)).toBe(true);
    });

    test("Chargily uses deterministic SHA-512 signatures", () => {
        const raw = Buffer.from(JSON.stringify({ id: "event" }));
        const signature = signatureFor(raw, "webhook-secret");
        expect(signature).toMatch(/^[a-f0-9]{128}$/);
        expect(signatureFor(raw, "webhook-secret")).toBe(signature);
        expect(signatureFor(raw, "different-secret")).not.toBe(signature);
    });

    test("feature middleware blocks unavailable plan features", async () => {
        jest.spyOn(Plans, "getEntitlements").mockResolvedValueOnce({ plan: PLANS.free });
        const next = jest.fn();
        await Plans.requireFeature("reports")({ orgId: "organization" }, {}, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 402, code: "UPGRADE_REQUIRED" }));
    });

    test("Chargily production configuration requires both secrets", () => {
        expect(() => validateEnv({ ...baseEnv, BILLING_PROVIDER: "chargily" })).toThrow(/Chargily/);
        const config = validateEnv({
            ...baseEnv,
            BILLING_PROVIDER: "chargily",
            CHARGILY_SECRET_KEY: "configured-secret",
            CHARGILY_WEBHOOK_SECRET: "configured-webhook-secret"
        });
        expect(config.CHARGILY_BASE_URL).toContain("chargily.net");
    });
});
