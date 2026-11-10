const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const request = require("supertest");
const app = require("../app");
const Auth = require("../src/models/Auth");
const Product = require("../src/models/Product");
const StockMovement = require("../src/models/Inventory");
const ProductServices = require("../src/Services/Product.Service");
const ProductController = require("../src/Controllers/Product.Controller");
const OrderServices = require("../src/Services/Orders.Service");

const userInfo = {
    name: "Test Customer",
    number: "0551234567",
    city: "Alger",
    address: "1 Test Street",
    delivery: "Domicile"
};

const createProduct = (owner, overrides = {}) => Product.create({
    name: "Test product",
    price: 100,
    category: "Testing",
    stock: 10,
    owner,
    image: "test.jpg",
    ...overrides
});

const authorization = (userId) => ({
    Authorization: `Bearer ${jwt.sign({ userId }, process.env.SECRET_JWT)}`
});

describe("reported regressions", () => {
    test("dashboard and inventory GET routes are mounted and return 200", async () => {
        const owner = new mongoose.Types.ObjectId();
        const headers = authorization(owner);

        await request(app).get("/api/dashboard/product").set(headers).expect(200);
        await request(app).get("/api/dashboard/order").set(headers).expect(200);
        await request(app).get("/api/quantity/low-stock").set(headers).expect(200);
        await request(app).get("/api/quantity/out-stock").set(headers).expect(200);
    });

    test("duplicate key errors reach next as a 409 AppError", async () => {
        jest.spyOn(ProductServices, "createProduct").mockRejectedValueOnce({
            code: 11000
        });
        const next = jest.fn();
        const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };

        await ProductController.createProduct(
            { body: {}, file: {}, user: { userId: "user" } },
            res,
            next
        );

        expect(next).toHaveBeenCalledWith(expect.objectContaining({
            message: "Product already exists",
            statusCode: 409
        }));
        expect(res.status).not.toHaveBeenCalled();
    });

    test("product creation persists stock and low-stock threshold", async () => {
        const owner = new mongoose.Types.ObjectId();
        const result = await ProductServices.createProduct(
            {
                name: "Stocked product",
                price: 25,
                category: "Testing",
                stock: 7,
                lowStockThreshold: 2
            },
            { filename: "test.jpg" },
            owner
        );

        expect(result.Product.stock).toBe(7);
        expect(result.Product.lowStockThreshold).toBe(2);
    });

    test("search and category values are treated as literal text", async () => {
        const owner = new mongoose.Types.ObjectId();
        await createProduct(owner, {
            name: "C++ (Pro)",
            category: "Tools [Special]"
        });
        await createProduct(owner, {
            name: "C Pro",
            category: "Tools Special"
        });

        const response = await request(app)
            .get("/api/product")
            .query({ search: "C++ (Pro)", category: "Tools [Special]" })
            .set(authorization(owner))
            .expect(200);

        expect(response.body.products).toHaveLength(1);
        expect(response.body.products[0].name).toBe("C++ (Pro)");
    });

    test("product analysis does not project missing user details", async () => {
        const owner = new mongoose.Types.ObjectId();
        await createProduct(owner, { stock: 3, price: 20 });

        const result = await ProductServices.analysisProducts(owner);

        expect(result).toEqual({
            totalProducts: 1,
            totalStock: 3,
            totalstockValue: 60
        });
        expect(result).not.toHaveProperty("userDetails");
    });

    test("an order containing another user's product returns a controlled 404", async () => {
        const owner = new mongoose.Types.ObjectId();
        const otherOwner = new mongoose.Types.ObjectId();
        const foreignProduct = await createProduct(otherOwner);

        await expect(OrderServices.createOrder({
            products: [{ product: foreignProduct._id, quantity: 1 }],
            userInfo
        }, owner)).rejects.toMatchObject({
            message: "One or more products were not found",
            statusCode: 404
        });
    });

    test("cancelled orders cannot be reopened and stock is restored only once", async () => {
        const owner = new mongoose.Types.ObjectId();
        const product = await createProduct(owner, { stock: 10 });
        const order = await OrderServices.createOrder({
            products: [{ product: product._id, quantity: 2 }],
            userInfo
        }, owner);

        expect((await Product.findById(product._id)).stock).toBe(8);

        await OrderServices.updateOrderStatus(order._id, owner, {
            status: "confirmed"
        });
        await expect(OrderServices.updateOrderStatus(order._id, owner, {
            status: "delivered"
        })).rejects.toMatchObject({ statusCode: 409 });

        await OrderServices.CancelOrder(order._id, owner);
        expect((await Product.findById(product._id)).stock).toBe(10);

        await expect(OrderServices.updateOrderStatus(order._id, owner, {
            status: "confirmed"
        })).rejects.toMatchObject({ statusCode: 409 });
        expect((await Product.findById(product._id)).stock).toBe(10);
    });

    test("model references and inventory indexes use existing names", async () => {
        const user = await Auth.create({
            name: "Owner",
            email: "owner@example.com",
            password: "hashed"
        });
        const product = await createProduct(user._id);
        const populated = await Product.findById(product._id).populate("owner");

        expect(populated.owner.email).toBe("owner@example.com");
        expect(Product.schema.path("minStock")).toBeUndefined();
        expect(StockMovement.schema.indexes()).toContainEqual([
            { owner: 1, action: 1, createdAt: -1 },
            {}
        ]);
    });
});
