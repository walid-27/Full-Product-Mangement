const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const app = require("../app");
const Auth = require("../src/models/Auth");
const Organization = require("../src/models/Organization");
const Membership = require("../src/models/Membership");
const Product = require("../src/models/Product");
const StockMovement = require("../src/models/Inventory");
const ProductServices = require("../src/Services/Product.Service");
const ProductController = require("../src/Controllers/Product.Controller");
const OrderServices = require("../src/Services/Orders.Service");

const userInfo = {
    name: "Test Customer", number: "0551234567", city: "Alger",
    address: "1 Test Street", delivery: "Domicile"
};

const createTenant = async () => {
    const user = await Auth.create({
        name: "Owner", email: `${new mongoose.Types.ObjectId()}@example.com`, password: "hashed"
    });
    const organization = await Organization.create({ name: "Tenant", slug: `tenant-${new mongoose.Types.ObjectId()}` });
    await Membership.create({ user: user._id, organization: organization._id, role: "owner", status: "active" });
    return {
        user, organization,
        context: { actor: user._id, ip: "127.0.0.1" },
        headers: { Authorization: `Bearer ${jwt.sign({ userId: user._id, orgId: organization._id }, process.env.SECRET_JWT)}` }
    };
};
const createProduct = (organization, overrides = {}) => Product.create({
    name: "Test product", price: 100, category: "Testing", stock: 10,
    organization, image: "test.jpg", ...overrides
});

describe("reported regressions", () => {
    test("dashboard and inventory GET routes are mounted and return 200", async () => {
        const tenant = await createTenant();
        await request(app).get("/api/dashboard/product").set(tenant.headers).expect(200);
        await request(app).get("/api/dashboard/order").set(tenant.headers).expect(200);
        await request(app).get("/api/quantity/low-stock").set(tenant.headers).expect(200);
        await request(app).get("/api/quantity/out-stock").set(tenant.headers).expect(200);
    });

    test("duplicate key errors reach next as a 409 AppError", async () => {
        jest.spyOn(ProductServices, "createProduct").mockRejectedValueOnce({ code: 11000 });
        const next = jest.fn();
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
        await ProductController.createProduct({
            body: {}, file: {}, orgId: "org", auditContext: {}
        }, res, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: "Product already exists", statusCode: 409 }));
        expect(res.status).not.toHaveBeenCalled();
    });

    test("product creation persists stock and low-stock threshold", async () => {
        const tenant = await createTenant();
        const result = await ProductServices.createProduct({
            name: "Stocked product", price: 25, category: "Testing", stock: 7, lowStockThreshold: 2
        }, { filename: "test.jpg" }, tenant.organization._id, tenant.context);
        expect(result.Product.stock).toBe(7);
        expect(result.Product.lowStockThreshold).toBe(2);
    });

    test("search and category values are treated as literal text", async () => {
        const tenant = await createTenant();
        await createProduct(tenant.organization._id, { name: "C++ (Pro)", category: "Tools [Special]" });
        await createProduct(tenant.organization._id, { name: "C Pro", category: "Tools Special" });
        const response = await request(app).get("/api/product")
            .query({ search: "C++ (Pro)", category: "Tools [Special]" })
            .set(tenant.headers).expect(200);
        expect(response.body.products).toHaveLength(1);
        expect(response.body.products[0].name).toBe("C++ (Pro)");
    });

    test("product analysis does not project missing user details", async () => {
        const tenant = await createTenant();
        await createProduct(tenant.organization._id, { stock: 3, price: 20 });
        expect(await ProductServices.analysisProducts(tenant.organization._id)).toEqual({
            totalProducts: 1, totalStock: 3, totalstockValue: 60
        });
    });

    test("an order containing another tenant's product returns a controlled 404", async () => {
        const tenant = await createTenant();
        const other = await createTenant();
        const foreignProduct = await createProduct(other.organization._id);
        await expect(OrderServices.createOrder({
            products: [{ product: foreignProduct._id, quantity: 1 }], userInfo
        }, tenant.organization._id, tenant.context)).rejects.toMatchObject({ statusCode: 404 });
    });

    test("cancelled orders cannot be reopened and stock is restored only once", async () => {
        const tenant = await createTenant();
        const organization = tenant.organization._id;
        const product = await createProduct(organization, { stock: 10 });
        const order = await OrderServices.createOrder({
            products: [{ product: product._id, quantity: 2 }], userInfo
        }, organization, tenant.context);
        expect((await Product.findById(product._id)).stock).toBe(8);
        await OrderServices.updateOrderStatus(order._id, organization, { status: "confirmed" }, tenant.context);
        await expect(OrderServices.updateOrderStatus(order._id, organization, { status: "delivered" }, tenant.context))
            .rejects.toMatchObject({ statusCode: 409 });
        await OrderServices.CancelOrder(order._id, organization, tenant.context);
        expect((await Product.findById(product._id)).stock).toBe(10);
        await expect(OrderServices.updateOrderStatus(order._id, organization, { status: "confirmed" }, tenant.context))
            .rejects.toMatchObject({ statusCode: 409 });
        expect((await Product.findById(product._id)).stock).toBe(10);
    });

    test("model references and inventory indexes use existing names", async () => {
        const tenant = await createTenant();
        const product = await createProduct(tenant.organization._id);
        const populated = await Product.findById(product._id).populate("organization");
        expect(populated.organization.name).toBe("Tenant");
        expect(Product.schema.path("minStock")).toBeUndefined();
        expect(StockMovement.schema.indexes()).toContainEqual([{ organization: 1, action: 1, createdAt: -1 }, {}]);
    });
});
