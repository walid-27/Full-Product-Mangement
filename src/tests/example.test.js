const request = require("supertest");
const app = require("../../app");
const Auth = require("../models/Auth");

describe("Express app", () => {
    test("GET products without token should return 401", async () => {
        const response = await request(app).get("/api/product");

        expect(response.status).toBe(401);
    });
});

describe("Auth API", () => {
    test("POST /auth/register should create a new user", async () => {
        const response = await request(app)
            .post("/auth/register")
            .send({
                name: "Test User",
                email: "test@gmail.com",
                password: "Password123!"
            });

        expect(response.status).toBe(201);

        const user = await Auth.findOne({
            email: "test@gmail.com"
        });

        expect(user).not.toBeNull();
        expect(user.password).not.toBe("Password123!");
    });

    test("POST /auth/login should return a token", async () => {
        // 1. Create the user first
        const registerResponse = await request(app)
            .post("/auth/register")
            .send({
                name: "Login User",
                email: "login@gmail.com",
                password: "Password123!"
            });
        expect(registerResponse.status).toBe(201);

        // 2. Login with the same credentials
        const loginResponse = await request(app)
            .post("/auth/login")
            .send({
                email: "login@gmail.com",
                password: "Password123!"
            });

            console.log("LOGIN RESPONSE:", loginResponse.body);
        expect(loginResponse.status).toBe(200);
        expect(loginResponse.body.register).toHaveProperty("token");
        expect(typeof loginResponse.body.register.token).toBe("string");
        expect(loginResponse.body.register.email).toBe("login@gmail.com");
    });

    test("POST /auth/login should reject wrong password", async () => {
    await request(app)
        .post("/auth/register")
        .send({
            name: "Test User",
            email: "wrong-password@gmail.com",
            password: "Password123!"
        });

    const response = await request(app)
        .post("/auth/login")
        .send({
            email: "wrong-password@gmail.com",
            password: "WrongPassword123!"
        });

    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty("message");
    expect(response.body).not.toHaveProperty("token");
    });
});

describe("Protected Product API", () => {
    test("should reject an invalid token", async () => {
        const response = await request(app)
            .get("/api/product")
            .set("Authorization", "Bearer invalid-token");

        expect(response.status).toBe(401);
    });
});