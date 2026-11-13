/*
 * Browser-facing auth pages + email-delivery resilience.
 * Models are mocked so this runs without MongoDB (unit config).
 */
jest.mock("../src/models/AuthToken", () => ({
    findOneAndUpdate: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ acknowledged: true }),
    create: jest.fn().mockResolvedValue({})
}));
jest.mock("../src/models/Auth", () => ({
    updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
    findOne: jest.fn(),
    findById: jest.fn()
}));
jest.mock("../src/Services/Analytics.Service", () => ({
    track: jest.fn().mockResolvedValue(undefined)
}));

const request = require("supertest");
const { createApp } = require("../app");
const AuthToken = require("../src/models/AuthToken");
const Auth = require("../src/models/Auth");
const Account = require("../src/Services/Account.Service");
const Email = require("../src/Services/Email.Service");

const TOKEN = "a".repeat(40);
const app = createApp();

describe("GET /auth/verify-email (the emailed link)", () => {
    beforeEach(() => jest.clearAllMocks());

    test("verifies the token and renders a success page", async () => {
        AuthToken.findOneAndUpdate.mockResolvedValue({ user: "64b64c2f4f5a6b7c8d9e0f11" });
        const response = await request(app).get(`/auth/verify-email?token=${TOKEN}`).expect(200);
        expect(response.headers["content-type"]).toMatch(/html/);
        expect(response.text).toMatch(/Email verified/);
        expect(Auth.updateOne).toHaveBeenCalled();
    });

    test("renders an error page for an invalid or expired token", async () => {
        AuthToken.findOneAndUpdate.mockResolvedValue(null);
        const response = await request(app).get(`/auth/verify-email?token=${TOKEN}`).expect(400);
        expect(response.text).toMatch(/invalid or expired/i);
    });

    test("rejects a missing token without touching the database", async () => {
        const response = await request(app).get("/auth/verify-email").expect(400);
        expect(response.text).toMatch(/invalid/i);
        expect(AuthToken.findOneAndUpdate).not.toHaveBeenCalled();
    });
});

describe("GET /auth/reset-password (the emailed link)", () => {
    beforeEach(() => jest.clearAllMocks());

    test("renders the form without consuming the token", async () => {
        const response = await request(app).get(`/auth/reset-password?token=${TOKEN}`).expect(200);
        expect(response.headers["content-type"]).toMatch(/html/);
        expect(response.text).toContain(TOKEN);
        expect(response.text).toMatch(/new password/i);
        expect(AuthToken.findOneAndUpdate).not.toHaveBeenCalled();
    });

    test("rejects a missing token", async () => {
        await request(app).get("/auth/reset-password").expect(400);
    });
});

describe("email delivery failures never break account flows", () => {
    beforeEach(() => jest.clearAllMocks());

    test("sendVerification resolves even when the provider is down", async () => {
        jest.spyOn(Email, "sendVerification").mockRejectedValue(new Error("provider down"));
        const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        await expect(Account.sendVerification({ _id: "64b64c2f4f5a6b7c8d9e0f11", email: "a@example.com" })).resolves.toBeUndefined();
        expect(AuthToken.create).toHaveBeenCalled();
        errorSpy.mockRestore();
        Email.sendVerification.mockRestore();
    });

    test("forgotPassword resolves even when the provider is down", async () => {
        Auth.findOne.mockResolvedValue({ _id: "64b64c2f4f5a6b7c8d9e0f11", email: "a@example.com" });
        jest.spyOn(Email, "sendPasswordReset").mockRejectedValue(new Error("provider down"));
        const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
        await expect(Account.forgotPassword("a@example.com")).resolves.toBeUndefined();
        errorSpy.mockRestore();
        Email.sendPasswordReset.mockRestore();
    });
});

describe("POST /auth/verify-email (API contract unchanged)", () => {
    beforeEach(() => jest.clearAllMocks());

    test("still answers JSON for API clients", async () => {
        AuthToken.findOneAndUpdate.mockResolvedValue({ user: "64b64c2f4f5a6b7c8d9e0f11" });
        const response = await request(app).post("/auth/verify-email").send({ token: TOKEN }).expect(200);
        expect(response.body).toEqual({ message: "Email verified" });
    });
});
