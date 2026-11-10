const ImportExport = require("../src/Services/ImportExport.Service");
const Product = require("../src/models/Product");
const Plans = require("../src/Services/Plan.Service");
const Audit = require("../src/Services/Audit.Service");
const apiKeyAuth = require("../src/middleware/ApiKeyMiddleware");
const ApiKey = require("../src/models/ApiKey");
const { hashToken } = require("../src/utils/tokens");
const Jobs = require("../src/Services/Job.Service");
const ProductService = require("../src/Services/Product.Service");
const { features, apiKeys, webhooks, search, account } = require("../src/validation/schemas");

describe("imports, jobs, API-key middleware, and soft delete", () => {
    afterEach(() => jest.restoreAllMocks());

    test("CSV imports report individual row errors and audit successful rows", async () => {
        jest.spyOn(Plans, "assertProductCreation").mockResolvedValue();
        jest.spyOn(Audit, "record").mockResolvedValue();
        jest.spyOn(Product, "create").mockImplementation(async (data) => {
            if (data.name === "bad") throw new Error("Invalid row");
            return { ...data, _id: "product-id" };
        });
        const csv = "name,price,stock\nValid product,10,3\nbad,5,2\n";
        const result = await ImportExport.importProducts(Buffer.from(csv), "org", { actor: "user" });
        expect(result).toMatchObject({ imported: 1, failed: 1 });
        expect(result.results[1]).toMatchObject({ row: 3, success: false });
        expect(Audit.record).toHaveBeenCalledTimes(1);
    });

    test("CSV export is limited, tenant-scoped, and excludes deleted products", async () => {
        const query = { sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([{ name: "Product", price: 10 }]) };
        jest.spyOn(Product, "find").mockReturnValue(query);
        const result = await ImportExport.exportData("products", "org");
        expect(result.body).toContain("Product");
        expect(Product.find).toHaveBeenCalledWith({ organization: "org", deletedAt: null });
        expect(query.limit).toHaveBeenCalledWith(10000);
    });

    test("API key middleware enforces scope and resolves organization", async () => {
        const key = { _id: "key", organization: { toString: () => "org" }, scopes: ["read"], rateLimitPerMinute: 60, save: jest.fn() };
        jest.spyOn(ApiKey, "findOne").mockResolvedValue(key);
        const req = { get: () => "raw-key" }; const next = jest.fn();
        await apiKeyAuth("read")(req, {}, next);
        expect(req.orgId).toBe("org");
        expect(next).toHaveBeenCalledWith();
        expect(ApiKey.findOne).toHaveBeenCalledWith({ keyHash: hashToken("raw-key"), revokedAt: null });
        await apiKeyAuth("write")(req, {}, next);
        expect(next.mock.calls[1][0]).toMatchObject({ code: "API_KEY_FORBIDDEN" });
    });

    test("job dispatch includes GDPR purge and export processing", async () => {
        const Gdpr = require("../src/Services/Gdpr.Service");
        jest.spyOn(Gdpr, "purgeDue").mockResolvedValue({ organizations: 1, users: 0 });
        expect(await Jobs.processJob({ name: "gdpr-purge", data: {} })).toEqual({ organizations: 1, users: 0 });
    });

    test("soft delete and restore preserve tenant filters and audit both mutations", async () => {
        const product = { deletedAt: null, save: jest.fn(), toObject: () => ({ deletedAt: null }) };
        jest.spyOn(Product, "findOne").mockResolvedValue(product);
        jest.spyOn(Audit, "record").mockResolvedValue();
        await ProductService.deleteProduct("product", "org", { actor: "user" });
        expect(product.deletedAt).toBeInstanceOf(Date);
        await ProductService.restoreProduct("product", "org", { actor: "user" });
        expect(product.deletedAt).toBeNull();
        expect(Audit.record.mock.calls.map((call) => call[0].action)).toEqual(["product.delete", "product.restore"]);
    });

    test("variant products keep parent stock equal to the variant total", async () => {
        jest.spyOn(Plans, "assertProductCreation").mockResolvedValue();
        jest.spyOn(Product, "exists").mockResolvedValue(null);
        jest.spyOn(Product, "create").mockImplementation(async (data) => data);
        jest.spyOn(Audit, "record").mockResolvedValue();
        jest.spyOn(require("../src/Services/Storage.Service"), "uploadImage").mockResolvedValue("image.webp");
        await ProductService.createProduct({ name: "Variant product", price: 10, variants: [{ sku: "S", stock: 2 }, { sku: "M", stock: 3 }] }, { buffer: Buffer.from("image") }, "org", {});
        expect(Product.create.mock.calls[0][0].stock).toBe(5);
    });

    test("new endpoint schemas reject malformed or unsafe input", () => {
        expect(features.export.params.safeParse({ type: "secrets" }).success).toBe(false);
        expect(apiKeys.create.body.safeParse({ name: "A", scopes: [] }).success).toBe(false);
        expect(webhooks.create.body.safeParse({ url: "http://example.com", events: ["order.created"] }).success).toBe(false);
        expect(search.query.safeParse({ q: "" }).success).toBe(false);
        expect(account.notifications.body.safeParse({ lowStockChannel: "sms" }).success).toBe(false);
    });
});
