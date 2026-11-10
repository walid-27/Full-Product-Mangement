const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");
const { createHmac } = require("crypto");
const Storage = require("../src/Services/Storage.Service");
const Cache = require("../src/Services/Cache.Service");
const ApiKeys = require("../src/Services/ApiKey.Service");
const ApiKey = require("../src/models/ApiKey");
const Webhooks = require("../src/Services/Webhook.Service");
const OutgoingWebhook = require("../src/models/OutgoingWebhook");
const Reports = require("../src/Services/Report.Service");
const Documents = require("../src/Services/Document.Service");
const Search = require("../src/Services/Search.Service");
const Delivery = require("../src/Services/Delivery.Service");
const Analytics = require("../src/Services/Analytics.Service");
const AnalyticsEvent = require("../src/models/AnalyticsEvent");

const org = "507f1f77bcf86cd799439011";
const thenable = (value) => ({ lean: jest.fn().mockResolvedValue(value), select: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis() });

describe("platform feature units", () => {
    afterEach(() => jest.restoreAllMocks());

    test("storage checks signatures, rotates/resizes to WebP, and deletes local images", async () => {
        expect(Storage.isSupportedImage(Buffer.from("not an image"))).toBe(false);
        await expect(Storage.uploadImage({ buffer: Buffer.from("fake") }, org)).rejects.toMatchObject({ code: "INVALID_IMAGE" });
        const image = await sharp({ create: { width: 20, height: 10, channels: 3, background: "red" } }).png().toBuffer();
        const stored = await Storage.uploadImage({ buffer: image }, org);
        expect(stored).toMatch(/\.webp$/);
        expect((await sharp(path.join(__dirname, "../uploads", stored)).metadata()).format).toBe("webp");
        await Storage.deleteImage(stored);
        await expect(fs.access(path.join(__dirname, "../uploads", stored))).rejects.toThrow();
    });

    test("cache isolates tenants and invalidates only one tenant", async () => {
        await Cache.set(org, "dashboard", { total: 1 });
        await Cache.set("507f1f77bcf86cd799439012", "dashboard", { total: 2 });
        expect(await Cache.cached(org, "dashboard", jest.fn())).toEqual({ total: 1 });
        await Cache.invalidateOrganization(org);
        expect(await Cache.get(org, "dashboard")).toBeNull();
        expect(await Cache.get("507f1f77bcf86cd799439012", "dashboard")).toEqual({ total: 2 });
    });

    test("API keys expose the raw key once and only persist its hash", async () => {
        jest.spyOn(ApiKey, "create").mockImplementation(async (value) => value);
        const result = await ApiKeys.create(org, { name: "Integration", scopes: ["read"] });
        expect(result.key).toMatch(/^sk_/);
        expect(ApiKey.create.mock.calls[0][0].keyHash).not.toBe(result.key);
        expect(ApiKey.create.mock.calls[0][0].keyHash).toHaveLength(64);
        expect(result.keyHash).toBeUndefined();
    });

    test("outgoing webhooks sign timestamp and raw body", async () => {
        jest.spyOn(OutgoingWebhook, "findById").mockResolvedValue({ active: true, secret: "secret", url: "https://example.com/hook" });
        global.fetch = jest.fn().mockResolvedValue({ ok: true });
        await Webhooks.deliver({ webhookId: "id", event: "order.created", payload: { id: 1 } });
        const [, options] = global.fetch.mock.calls[0];
        const expected = createHmac("sha256", "secret").update(`${options.headers["x-saas-timestamp"]}.${options.body}`).digest("hex");
        expect(options.headers["x-saas-signature"]).toBe(expected);
        delete global.fetch;
    });

    test("reports keep organization in aggregation filters and documents produce PDFs", async () => {
        const Order = require("../src/models/Order");
        const Product = require("../src/models/Product");
        const aggregate = jest.spyOn(Order, "aggregate").mockResolvedValue([]);
        await Reports.sales(org, "week");
        await Reports.bestSellers(org);
        expect(aggregate.mock.calls[0][0][0].$match.organization.toString()).toBe(org);
        expect(aggregate.mock.calls[1][0][0].$match.organization.toString()).toBe(org);
        jest.spyOn(Product, "aggregate").mockResolvedValue([{ stockValue: 100 }]);
        expect(await Reports.stockReport(org)).toEqual([{ stockValue: 100 }]);
        jest.spyOn(Order, "findOne").mockReturnValue(thenable({ _id: org, products: [], userInfo: { name: "Customer", city: "Algiers", address: "Street", number: "0555555555" }, totalPrice: 0, status: "pending", createdAt: new Date() }));
        const pdf = await Documents.orderDocument(org, org, "invoice");
        expect(pdf.subarray(0, 4).toString()).toBe("%PDF");
    });

    test("search and delivery remain tenant-scoped/provider isolated", async () => {
        const Product = require("../src/models/Product");
        const Order = require("../src/models/Order");
        jest.spyOn(Product, "find").mockReturnValue(thenable([]));
        jest.spyOn(Order, "find").mockReturnValue(thenable([]));
        await Search.search(org, { q: "test", limit: 5 });
        expect(Product.find.mock.calls[0][0].organization).toBe(org);
        expect(Order.find.mock.calls[0][0].organization).toBe(org);
        const provider = Delivery.getDeliveryProvider();
        expect((await provider.createShipment({ _id: org, userInfo: { delivery: "Desk" } })).provider).toBe("local");
    });

    test("analytics persists event properties", async () => {
        jest.spyOn(AnalyticsEvent, "create").mockResolvedValue({});
        await Analytics.track("signup", { organization: org, source: "test" });
        expect(AnalyticsEvent.create).toHaveBeenCalledWith({ event: "signup", organization: org, user: undefined, properties: { source: "test" } });
    });
});
