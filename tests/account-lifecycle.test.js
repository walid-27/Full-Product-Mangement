const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const app = require("../app");
const Auth = require("../src/models/Auth");
const Organization = require("../src/models/Organization");
const Membership = require("../src/models/Membership");
const RefreshToken = require("../src/models/RefreshToken");
const Email = require("../src/Services/Email.Service");

const PASSWORD = "SecurePassphrase9";
const NEXT_PASSWORD = "DifferentPassphrase8";
const credentials = (email) => ({ email, password: PASSWORD });
const createVerifiedUser = async () => {
    const user = await Auth.create({
        name: "Verified User",
        email: `${new mongoose.Types.ObjectId()}@example.com`,
        password: await bcrypt.hash(PASSWORD, 12),
        emailVerifiedAt: new Date()
    });
    const organization = await Organization.create({ name: "Account Org", slug: `account-${new mongoose.Types.ObjectId()}` });
    await Membership.create({ user: user._id, organization: organization._id, role: "owner", status: "active" });
    return { user, organization };
};
const refreshCookie = (response) => response.headers["set-cookie"].find((cookie) => cookie.startsWith("refreshToken="));

describe("Phase 2 account lifecycle", () => {
    beforeEach(() => Email.resetEmailOutbox());

    test("registration sends verification, restricts access, and verification unlocks it", async () => {
        const email = "verify-me@example.com";
        const response = await request(app).post("/auth/register").send({
            name: "Verify Me", email, password: PASSWORD
        }).expect(201);
        expect(response.body.register.emailVerified).toBe(false);
        expect(response.body.register.refreshToken).toBeUndefined();
        expect(refreshCookie(response)).toMatch(/HttpOnly/);
        expect(refreshCookie(response)).toMatch(/SameSite=Strict/);
        expect(Email.outbox).toHaveLength(1);

        await request(app).get("/api/product")
            .set("Authorization", `Bearer ${response.body.register.token}`).expect(403);
        await request(app).post("/auth/verify-email")
            .send({ token: Email.outbox[0].token }).expect(200);
        await request(app).get("/api/product")
            .set("Authorization", `Bearer ${response.body.register.token}`).expect(200);
    });

    test("resending verification invalidates the previous link", async () => {
        const registered = await request(app).post("/auth/register").send({
            name: "Resend User", email: "resend@example.com", password: PASSWORD
        }).expect(201);
        const firstToken = Email.outbox[0].token;
        await request(app).post("/auth/resend-verification")
            .set("Authorization", `Bearer ${registered.body.register.token}`).expect(202);
        await request(app).post("/auth/verify-email").send({ token: firstToken }).expect(400);
        await request(app).post("/auth/verify-email").send({ token: Email.outbox[1].token }).expect(200);
    });

    test("forgot/reset is non-enumerating, single-use, and revokes sessions", async () => {
        const { user } = await createVerifiedUser();
        const login = await request(app).post("/auth/login").send(credentials(user.email)).expect(200);
        const oldRefresh = refreshCookie(login);
        await request(app).post("/auth/forgot-password").send({ email: "unknown@example.com" }).expect(202);
        expect(Email.outbox).toHaveLength(0);
        await request(app).post("/auth/forgot-password").send({ email: user.email }).expect(202);
        expect(Email.outbox).toHaveLength(1);

        await request(app).post("/auth/reset-password")
            .send({ token: Email.outbox[0].token, password: NEXT_PASSWORD }).expect(200);
        await request(app).post("/auth/reset-password")
            .send({ token: Email.outbox[0].token, password: NEXT_PASSWORD }).expect(400);
        await request(app).post("/auth/refresh").set("Cookie", oldRefresh).expect(401);
        await request(app).post("/auth/login").send(credentials(user.email)).expect(401);
        await request(app).post("/auth/login").send({ email: user.email, password: NEXT_PASSWORD }).expect(200);
    });

    test("refresh rotates cookies, uses 15-minute access tokens, and detects reuse", async () => {
        const { user } = await createVerifiedUser();
        const login = await request(app).post("/auth/login").send(credentials(user.email)).expect(200);
        const firstCookie = refreshCookie(login);
        const decoded = jwt.decode(login.body.register.token);
        expect(decoded.exp - decoded.iat).toBe(15 * 60);

        const rotated = await request(app).post("/auth/refresh").set("Cookie", firstCookie).expect(200);
        const secondCookie = refreshCookie(rotated);
        expect(secondCookie).not.toBe(firstCookie);
        await request(app).post("/auth/refresh").set("Cookie", firstCookie).expect(401);
        await request(app).post("/auth/refresh").set("Cookie", secondCookie).expect(401);
        expect(await RefreshToken.countDocuments({ user: user._id, revokedAt: null })).toBe(0);
    });

    test("logout and logout-all revoke refresh sessions", async () => {
        const { user } = await createVerifiedUser();
        const first = await request(app).post("/auth/login").send(credentials(user.email)).expect(200);
        const second = await request(app).post("/auth/login").send(credentials(user.email)).expect(200);
        await request(app).post("/auth/logout").set("Cookie", refreshCookie(first)).expect(204);
        await request(app).post("/auth/refresh").set("Cookie", refreshCookie(first)).expect(401);
        await request(app).post("/auth/logout-all")
            .set("Authorization", `Bearer ${second.body.register.token}`)
            .set("Cookie", refreshCookie(second)).expect(204);
        await request(app).post("/auth/refresh").set("Cookie", refreshCookie(second)).expect(401);
    });

    test("five failed logins cause a temporary lockout without enumeration", async () => {
        const { user } = await createVerifiedUser();
        await request(app).post("/auth/login").send({ email: "missing@example.com", password: "bad" }).expect(401);
        for (let attempt = 0; attempt < 5; attempt += 1) {
            await request(app).post("/auth/login").send({ email: user.email, password: "bad" }).expect(401);
        }
        await request(app).post("/auth/login").send(credentials(user.email)).expect(429);
    });

    test("weak and common passwords are rejected", async () => {
        await request(app).post("/auth/register").send({
            name: "Weak Password", email: "weak@example.com", password: "password123"
        }).expect(422);
        await request(app).post("/auth/register").send({
            name: "Weak Password", email: "weak@example.com", password: "alllowercase9"
        }).expect(422);
    });
});
