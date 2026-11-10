const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const request = require("supertest");
const app = require("../app");
const Auth = require("../src/models/Auth");
const Organization = require("../src/models/Organization");
const Membership = require("../src/models/Membership");
const Subscription = require("../src/models/Subscription");
const Product = require("../src/models/Product");
const UsageCounter = require("../src/models/UsageCounter");
const Invoice = require("../src/models/Invoice");
const Billing = require("../src/Services/Billing.Service");
const Orders = require("../src/Services/Orders.Service");
const Email = require("../src/Services/Email.Service");
const { signatureFor } = require("../src/Services/payments/ChargilyProvider");
const { monthKey } = require("../src/Services/Plan.Service");

const createTenant = async (plan = "free") => {
    const user = await Auth.create({
        name: "Billing Owner", email: `${new mongoose.Types.ObjectId()}@example.com`,
        password: await bcrypt.hash("SecurePassphrase9", 12), emailVerifiedAt: new Date()
    });
    const organization = await Organization.create({ name: "Billing Org", slug: `billing-${new mongoose.Types.ObjectId()}`, plan });
    await Membership.create({ user: user._id, organization: organization._id, role: "owner", status: "active" });
    const subscription = await Subscription.create({ organization: organization._id, plan, status: "active" });
    return {
        user, organization, subscription,
        headers: { Authorization: `Bearer ${jwt.sign({ userId: user._id, orgId: organization._id }, process.env.SECRET_JWT)}` },
        context: { actor: user._id, ip: "127.0.0.1" }
    };
};

describe("Phase 3 billing and plans", () => {
    beforeEach(() => Email.resetEmailOutbox());

    test("registration creates a 14-day Pro trial", async () => {
        const response = await request(app).post("/auth/register").send({
            name: "Trial Owner", email: "trial@example.com", password: "SecurePassphrase9"
        }).expect(201);
        const subscription = await Subscription.findOne({ organization: response.body.register.organization.id });
        expect(subscription.plan).toBe("pro");
        expect(subscription.status).toBe("trialing");
        expect(subscription.trialEndsAt - subscription.createdAt).toBeGreaterThan(13 * 24 * 60 * 60 * 1000);
    });

    test("Free product and team limits return 402 upgrade required", async () => {
        const tenant = await createTenant();
        await Product.insertMany(Array.from({ length: 25 }, (_, index) => ({
            name: `Product ${index}`, price: 10, stock: 1, organization: tenant.organization._id, image: "test.jpg"
        })));
        await request(app).post("/api/product").set(tenant.headers)
            .field("name", "Beyond limit").field("price", "10")
            .attach("image", "tests/load/fixtures/product.jpg").expect(402);
        await Membership.create({ user: (await Auth.create({ name: "Member", email: "member@example.com", password: "hash" }))._id, organization: tenant.organization._id, role: "staff" });
        await request(app).post("/api/organizations/invites").set(tenant.headers)
            .send({ email: "another@example.com", role: "viewer" }).expect(402);
    });

    test("monthly order limit blocks without deducting stock", async () => {
        const tenant = await createTenant();
        const product = await Product.create({ name: "Order product", price: 10, stock: 5, organization: tenant.organization._id, image: "test.jpg" });
        await UsageCounter.create({ organization: tenant.organization._id, month: monthKey(), orders: 50 });
        await expect(Orders.createOrder({
            products: [{ product: product._id, quantity: 1 }],
            userInfo: { name: "Customer", number: "0551234567", city: "Alger", address: "Street", delivery: "Desk" }
        }, tenant.organization._id, tenant.context)).rejects.toMatchObject({ statusCode: 402 });
        expect((await Product.findById(product._id)).stock).toBe(5);
    });

    test("owner checkout, portal, cancellation, and signed idempotent webhooks work", async () => {
        const tenant = await createTenant("pro");
        const admin = await Auth.create({ name: "Admin", email: "billing-admin@example.com", password: "hash", emailVerifiedAt: new Date() });
        await Membership.create({ user: admin._id, organization: tenant.organization._id, role: "admin", status: "active" });
        const adminHeaders = { Authorization: `Bearer ${jwt.sign({ userId: admin._id, orgId: tenant.organization._id }, process.env.SECRET_JWT)}` };
        await request(app).post("/api/billing/checkout").set(adminHeaders).send({ plan: "pro" }).expect(403);

        const checkout = await request(app).post("/api/billing/checkout").set(tenant.headers).send({ plan: "pro" }).expect(201);
        expect(checkout.body.checkoutUrl).toContain("/billing/mock-checkout/");
        await request(app).post("/api/billing/portal").set(tenant.headers).expect(200);
        const payload = JSON.stringify({
            event_id: "paid-event-1", type: "checkout.paid",
            data: { id: checkout.body.checkoutId, amount: 3000, metadata: { organizationId: tenant.organization._id.toString(), plan: "pro" } }
        });
        const signature = signatureFor(Buffer.from(payload), process.env.CHARGILY_WEBHOOK_SECRET);
        await request(app).post("/api/billing/webhook").set("Content-Type", "application/json")
            .set("signature", "invalid").send(payload).expect(401);
        await request(app).post("/api/billing/webhook").set("Content-Type", "application/json")
            .set("signature", signature).send(payload).expect(200);
        const duplicate = await request(app).post("/api/billing/webhook").set("Content-Type", "application/json")
            .set("signature", signature).send(payload).expect(200);
        expect(duplicate.body.duplicate).toBe(true);
        expect(await Invoice.countDocuments({ organization: tenant.organization._id, status: "paid" })).toBe(1);
        expect((await Subscription.findById(tenant.subscription._id)).status).toBe("active");
        expect(Email.outbox.some((email) => email.type === "receipt")).toBe(true);

        await request(app).get("/api/billing/invoices").set(tenant.headers).expect(200);
        await request(app).post("/api/billing/cancel").set(tenant.headers).expect(200);
        expect((await Subscription.findById(tenant.subscription._id)).cancelAtPeriodEnd).toBe(true);
    });

    test("failed payments start a grace period and send a billing email", async () => {
        const tenant = await createTenant("pro");
        const checkout = await request(app).post("/api/billing/checkout").set(tenant.headers).send({ plan: "pro" }).expect(201);
        const payload = JSON.stringify({
            event_id: "failed-event-1", type: "checkout.failed",
            data: { id: checkout.body.checkoutId, metadata: { organizationId: tenant.organization._id.toString(), plan: "pro" } }
        });
        await request(app).post("/api/billing/webhook").set("Content-Type", "application/json")
            .set("signature", signatureFor(Buffer.from(payload), process.env.CHARGILY_WEBHOOK_SECRET))
            .send(payload).expect(200);
        const subscription = await Subscription.findById(tenant.subscription._id);
        expect(subscription.status).toBe("past_due");
        expect(subscription.gracePeriodEndsAt).toBeTruthy();
        expect(Email.outbox.some((email) => email.type === "paymentFailed")).toBe(true);
    });

    test("past-due subscriptions downgrade after the grace period", async () => {
        const tenant = await createTenant("pro");
        tenant.subscription.status = "past_due";
        tenant.subscription.gracePeriodEndsAt = new Date(Date.now() - 1000);
        await tenant.subscription.save();
        await request(app).get("/api/billing/subscription").set(tenant.headers).expect(200);
        expect((await Subscription.findById(tenant.subscription._id)).plan).toBe("free");
        expect((await Organization.findById(tenant.organization._id)).plan).toBe("free");
    });

    test("trial-ending reminders are sent only once", async () => {
        const tenant = await createTenant("pro");
        tenant.subscription.status = "trialing";
        tenant.subscription.trialEndsAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
        await tenant.subscription.save();
        expect(await Billing.sendTrialEndingReminders()).toBe(1);
        expect(await Billing.sendTrialEndingReminders()).toBe(0);
        expect(Email.outbox.filter((email) => email.type === "trialEnding")).toHaveLength(1);
    });
});
