const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const app = require("../app");
const Auth = require("../src/models/Auth");
const Organization = require("../src/models/Organization");
const Membership = require("../src/models/Membership");
const Product = require("../src/models/Product");
const Order = require("../src/models/Order");
const AuditLog = require("../src/models/AuditLog");

const tokenFor = (user, organization) => jwt.sign({
    userId: user._id.toString(), email: user.email,
    ...(organization ? { orgId: organization._id.toString() } : {})
}, process.env.SECRET_JWT);
const auth = (user, organization, headerOrganization) => ({
    Authorization: `Bearer ${tokenFor(user, organization)}`,
    ...(headerOrganization ? { "x-org-id": headerOrganization._id.toString() } : {})
});
const createUser = async (name = "User") => Auth.create({
    name, email: `${new mongoose.Types.ObjectId()}@example.com`, password: "hashed"
});
const createTenant = async (name = "Tenant") => {
    const user = await createUser(`${name} Owner`);
    const organization = await Organization.create({ name, slug: `${name.toLowerCase()}-${new mongoose.Types.ObjectId()}` });
    await Membership.create({ user: user._id, organization: organization._id, role: "owner", status: "active" });
    return { user, organization };
};
const addMember = (user, organization, role = "viewer") => Membership.create({
    user: user._id, organization: organization._id, role, status: "active"
});
const productFor = (organization, name = "Tenant product") => Product.create({
    name, price: 10, stock: 5, category: "Test", organization: organization._id, image: "test.jpg"
});
const orderFor = (organization, product) => Order.create({
    organization: organization._id,
    products: [{ product: product._id, quantity: 1, price: 10 }],
    userInfo: { name: "Customer", number: "0551234567", city: "Alger", address: "Street", delivery: "Desk" },
    totalPrice: 10, status: "pending"
});

describe("Phase 1 multi-tenancy", () => {
    test("registration atomically creates an organization and owner membership", async () => {
        const response = await request(app).post("/auth/register").send({
            name: "New Owner", email: "new-owner@example.com", password: "SecurePassphrase9"
        }).expect(201);
        const registered = response.body.register;
        const user = await Auth.findOne({ email: registered.email });
        const membership = await Membership.findOne({ user: user._id, organization: registered.organization.id });
        expect(membership.role).toBe("owner");
        expect(jwt.decode(registered.token).orgId).toBe(registered.organization.id.toString());
    });

    test("tenant A cannot use tenant B's organization header on any read family", async () => {
        const a = await createTenant("Alpha");
        const b = await createTenant("Beta");
        const headers = auth(a.user, a.organization, b.organization);
        const paths = [
            "/api/product", "/api/product/analysis", "/api/order",
            "/api/quantity/low-stock", "/api/quantity/out-stock",
            "/api/dashboard/product", "/api/dashboard/order", "/api/organizations/audit-logs"
        ];
        for (const path of paths) await request(app).get(path).set(headers).expect(403);
    });

    test("tenant A cannot modify tenant B's products, orders, stock, or team", async () => {
        const a = await createTenant("Alpha");
        const b = await createTenant("Beta");
        const product = await productFor(b.organization);
        const order = await orderFor(b.organization, product);
        const headers = auth(a.user, a.organization, b.organization);

        await request(app).patch(`/api/product/${product._id}`).set(headers).send({ price: 20 }).expect(403);
        await request(app).delete(`/api/product/${product._id}`).set(headers).expect(403);
        await request(app).post(`/api/quantity/stock-in/${product._id}`).set(headers).send({ quantity: 1 }).expect(403);
        await request(app).post(`/api/quantity/stock-out/${product._id}`).set(headers).send({ quantity: 1 }).expect(403);
        await request(app).patch(`/api/order/status/${order._id}`).set(headers).send({ status: "confirmed" }).expect(403);
        await request(app).patch(`/api/order/cancel-order/${order._id}`).set(headers).expect(403);
        await request(app).post("/api/organizations/invites").set(headers)
            .send({ email: "person@example.com", role: "staff" }).expect(403);
    });

    test("own-tenant queries hide foreign data and return 404 for foreign IDs", async () => {
        const a = await createTenant("Alpha");
        const b = await createTenant("Beta");
        const ownProduct = await productFor(a.organization, "Alpha product");
        const foreignProduct = await productFor(b.organization, "Beta product");
        const foreignOrder = await orderFor(b.organization, foreignProduct);
        await orderFor(a.organization, ownProduct);

        const products = await request(app).get("/api/product").set(auth(a.user, a.organization)).expect(200);
        expect(products.body.products.map((item) => item.name)).toEqual(["Alpha product"]);
        const orders = await request(app).get("/api/order").set(auth(a.user, a.organization)).expect(200);
        expect(orders.body.Orders.orders).toHaveLength(1);
        await request(app).get(`/api/order/${foreignOrder._id}`).set(auth(a.user, a.organization)).expect(404);
        await request(app).patch(`/api/product/${foreignProduct._id}`).set(auth(a.user, a.organization))
            .send({ price: 99 }).expect(404);
        await request(app).post(`/api/quantity/stock-in/${foreignProduct._id}`).set(auth(a.user, a.organization))
            .send({ quantity: 1 }).expect(404);
    });

    test("viewers are read-only while staff can write stock", async () => {
        const tenant = await createTenant();
        const viewer = await createUser("Viewer");
        const staff = await createUser("Staff");
        await addMember(viewer, tenant.organization, "viewer");
        await addMember(staff, tenant.organization, "staff");
        const product = await productFor(tenant.organization);

        await request(app).get("/api/product").set(auth(viewer, tenant.organization)).expect(200);
        await request(app).post(`/api/quantity/stock-in/${product._id}`).set(auth(viewer, tenant.organization))
            .send({ quantity: 1 }).expect(403);
        await request(app).post(`/api/quantity/stock-in/${product._id}`).set(auth(staff, tenant.organization))
            .send({ quantity: 1 }).expect(201);
        await request(app).get("/api/organizations/audit-logs").set(auth(staff, tenant.organization)).expect(403);
    });

    test("invites are accepted once and organization switching issues a scoped token", async () => {
        const tenant = await createTenant();
        const invitee = await createUser("Invitee");
        const invite = await request(app).post("/api/organizations/invites")
            .set(auth(tenant.user, tenant.organization))
            .send({ email: invitee.email, role: "staff" }).expect(201);

        await request(app).post("/api/organizations/invites/accept").set(auth(invitee))
            .send({ token: invite.body.token }).expect(200);
        await request(app).post("/api/organizations/invites/accept").set(auth(invitee))
            .send({ token: invite.body.token }).expect(400);
        const organizations = await request(app).get("/api/organizations").set(auth(invitee)).expect(200);
        expect(organizations.body).toHaveLength(1);
        const switched = await request(app).post("/api/organizations/switch").set(auth(invitee))
            .send({ organizationId: tenant.organization._id }).expect(200);
        expect(jwt.decode(switched.body.token).orgId).toBe(tenant.organization._id.toString());
        await request(app).get("/api/product").set("Authorization", `Bearer ${switched.body.token}`).expect(200);
    });

    test("team role changes, removal, leaving, and last-owner protection work", async () => {
        const tenant = await createTenant();
        const member = await createUser("Member");
        const membership = await addMember(member, tenant.organization, "viewer");
        const removed = await createUser("Removed");
        const removedMembership = await addMember(removed, tenant.organization, "staff");

        await request(app).delete(`/api/organizations/members/${removedMembership._id}`)
            .set(auth(tenant.user, tenant.organization)).expect(200);
        expect(await Membership.exists({ _id: removedMembership._id })).toBeNull();
        await request(app).patch(`/api/organizations/members/${membership._id}/role`)
            .set(auth(tenant.user, tenant.organization)).send({ role: "admin" }).expect(200);
        await request(app).post("/api/organizations/leave").set(auth(member, tenant.organization)).expect(200);
        expect(await Membership.exists({ _id: membership._id })).toBeNull();
        await request(app).post("/api/organizations/leave").set(auth(tenant.user, tenant.organization)).expect(409);
    });

    test("only the owner can delete an organization", async () => {
        const tenant = await createTenant();
        const admin = await createUser("Admin");
        await addMember(admin, tenant.organization, "admin");
        await request(app).delete("/api/organizations").set(auth(admin, tenant.organization)).expect(403);
        await request(app).delete("/api/organizations").set(auth(tenant.user, tenant.organization)).expect(200);
        await request(app).get("/api/product").set(auth(tenant.user, tenant.organization)).expect(403);
    });

    test("product and stock changes create organization-scoped audit logs", async () => {
        const tenant = await createTenant();
        const created = await request(app).post("/api/product").set(auth(tenant.user, tenant.organization))
            .field("name", "Audited product").field("price", "12").field("stock", "2")
            .attach("image", "tests/load/fixtures/product.jpg").expect(201);
        const productId = created.body.product.Product._id;
        await request(app).post(`/api/quantity/stock-in/${productId}`).set(auth(tenant.user, tenant.organization))
            .send({ quantity: 1 }).expect(201);

        const response = await request(app).get("/api/organizations/audit-logs")
            .query({ entity: "stockMovement" }).set(auth(tenant.user, tenant.organization)).expect(200);
        expect(response.body.logs).toHaveLength(1);
        expect(response.body.logs[0].organization).toBe(tenant.organization._id.toString());
        expect(await AuditLog.countDocuments({ organization: tenant.organization._id })).toBe(2);
    });
});
