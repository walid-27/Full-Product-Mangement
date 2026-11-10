const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const { Writable } = require("stream");
const { createApp } = require("../app");
const app = createApp({ isDatabaseReady: () => true });
const { validateEnv } = require("../src/config/env");
const createLogger = require("../src/config/logger");
const ProductServices = require("../src/Services/Product.Service");
const AuthServices = require("../src/Services/Auth.Service");
const AppError = require("../src/utils/AppError");

const testConfig = (overrides = {}) => ({
    ...validateEnv(process.env),
    CORS_ORIGINS: ["https://allowed.example"],
    ...overrides
});

describe("Phase 0 security baseline", () => {
    test("environment validation fails fast for missing or weak secrets", () => {
        expect(() => validateEnv({})).toThrow(/MONGO_URL/);
        expect(() => validateEnv({
            MONGO_URL: "mongodb://localhost:27017/test",
            SECRET_JWT: "short"
        })).toThrow(/at least 32/);
    });

    test("environment validation parses origins and safe defaults", () => {
        const config = validateEnv({
            MONGO_URL: "mongodb://localhost:27017/test",
            SECRET_JWT: "a-secure-test-secret-that-is-over-32-characters",
            CORS_ORIGINS: "https://one.example, https://two.example"
        });

        expect(config.CORS_ORIGINS).toEqual(["https://one.example", "https://two.example"]);
        expect(config.PORT).toBe(5000);
        expect(config.AUTH_RATE_LIMIT_MAX).toBe(10);
    });

    test("health reports database readiness and unavailability", async () => {
        const response = await request(app).get("/health").expect(200);
        expect(response.body.status).toBe("ok");
        expect(response.body.database).toBe("ready");

        const unavailableApp = createApp({ isDatabaseReady: () => false });
        const unavailable = await request(unavailableApp).get("/health").expect(503);
        expect(unavailable.body.status).toBe("unavailable");
    });

    test("helmet headers and generated request ids are returned", async () => {
        const response = await request(app).get("/health").expect(200);

        expect(response.headers["x-content-type-options"]).toBe("nosniff");
        expect(response.headers["x-frame-options"]).toBe("SAMEORIGIN");
        expect(response.headers["x-powered-by"]).toBeUndefined();
        expect(response.headers["x-request-id"]).toMatch(/^[a-f0-9-]{36}$/);
    });

    test("CORS allows configured origins and rejects others", async () => {
        const isolatedApp = createApp({ config: testConfig(), isDatabaseReady: () => true });

        await request(isolatedApp)
            .get("/health")
            .set("Origin", "https://allowed.example")
            .expect("access-control-allow-origin", "https://allowed.example")
            .expect(200);

        const denied = await request(isolatedApp)
            .get("/health")
            .set("Origin", "https://denied.example")
            .expect(403);

        expect(denied.body.code).toBe("CORS_FORBIDDEN");
    });

    test("unknown routes use the consistent 404 error format", async () => {
        const response = await request(app).get("/does-not-exist").expect(404);

        expect(response.body).toEqual({
            code: "ROUTE_NOT_FOUND",
            message: "Route not found"
        });
    });

    test("zod rejects invalid input with 422 and field details", async () => {
        const response = await request(app).post("/auth/register").send({}).expect(422);

        expect(response.body.code).toBe("VALIDATION_ERROR");
        expect(response.body.message).toBe("Request validation failed");
        expect(response.body.details).toEqual(expect.arrayContaining([
            expect.objectContaining({ path: "email" }),
            expect.objectContaining({ path: "password" })
        ]));
    });

    test("malformed JSON does not leak parser internals", async () => {
        const response = await request(app)
            .post("/auth/login")
            .set("Content-Type", "application/json")
            .send('{"email":')
            .expect(400);

        expect(response.body).toEqual({
            code: "INVALID_JSON",
            message: "Malformed JSON request body"
        });
    });

    test("strict auth rate limiting returns 429 and retry metadata", async () => {
        const isolatedApp = createApp({
            config: testConfig(),
            authRateLimitMax: 2
        });
        const credentials = { email: "nobody@example.com", password: "password" };
        const loginSpy = jest.spyOn(AuthServices, "login").mockRejectedValue(
            new AppError("The email or password is invalid", 401, "INVALID_CREDENTIALS")
        );

        await request(isolatedApp).post("/auth/login").send(credentials).expect(401);
        await request(isolatedApp).post("/auth/login").send(credentials).expect(401);
        const response = await request(isolatedApp)
            .post("/auth/login")
            .send(credentials)
            .expect(429);

        expect(response.body.code).toBe("RATE_LIMITED");
        expect(response.headers["ratelimit"]).toBeDefined();
        loginSpy.mockRestore();
    });

    test("the global rate limiter protects non-auth routes", async () => {
        const isolatedApp = createApp({
            config: testConfig(),
            rateLimitMax: 1
        });

        await request(isolatedApp).get("/missing").expect(404);
        await request(isolatedApp).get("/missing").expect(429);
    });

    test("production errors hide internal messages", async () => {
        const isolatedApp = createApp({ config: testConfig({ NODE_ENV: "production" }) });
        jest.spyOn(ProductServices, "getProduct").mockRejectedValueOnce(
            new Error("private database connection details")
        );
        const userId = new mongoose.Types.ObjectId();
        const token = jwt.sign({ userId }, process.env.SECRET_JWT);

        const response = await request(isolatedApp)
            .get("/api/product")
            .set("Authorization", `Bearer ${token}`)
            .expect(500);

        expect(response.body).toEqual({
            code: "INTERNAL_ERROR",
            message: "Internal Server Error"
        });
        expect(JSON.stringify(response.body)).not.toContain("private database");
    });

    test("structured logs redact credentials", () => {
        let output = "";
        const destination = new Writable({
            write(chunk, encoding, callback) {
                output += chunk.toString();
                callback();
            }
        });
        const logger = createLogger(testConfig({ LOG_LEVEL: "info" }), destination);

        logger.info({
            req: {
                headers: { authorization: "Bearer secret-token", cookie: "refresh=secret" },
                body: { password: "secret-password" }
            }
        }, "safe log event");

        expect(output).toContain("[Redacted]");
        expect(output).not.toContain("secret-token");
        expect(output).not.toContain("secret-password");
        expect(output).not.toContain("refresh=secret");
    });
});
