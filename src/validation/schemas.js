const { z } = require("zod");
const { getPasswordErrors } = require("../utils/password");

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid resource identifier");
const pagination = {
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional()
};
const orderStatus = z.enum(["cancelled", "delivered", "confirmed", "pending", "shipped"]);
const idParams = z.object({ id: objectId });
const strongPassword = z.string().max(72).refine((password) => getPasswordErrors(password).length === 0, {
    message: "Password must have 12+ characters, uppercase/lowercase letters, a number, and not be common"
});
const emailField = z.string().trim().email().max(320).transform((value) => value.toLowerCase());
const variants = z.preprocess((value) => {
    if (typeof value !== "string") return value;
    try { return JSON.parse(value); } catch { return value; }
}, z.array(z.object({ sku: z.string().trim().min(1).max(100), size: z.string().max(50).optional(), color: z.string().max(50).optional(), stock: z.coerce.number().int().nonnegative() })).max(100).refine((items) => new Set(items.map((item) => item.sku)).size === items.length, { message: "Variant SKUs must be unique" }));

const auth = {
    register: {
        body: z.object({
            name: z.string().trim().min(2).max(100),
            email: emailField,
            password: strongPassword
        })
    },
    login: {
        body: z.object({ email: emailField, password: z.string().min(1).max(72) })
    },
    token: { body: z.object({ token: z.string().min(20).max(4096) }) },
    forgot: { body: z.object({ email: emailField }) },
    reset: { body: z.object({ token: z.string().min(20).max(4096), password: strongPassword }) }
};

const product = {
    create: {
        body: z.object({
            name: z.string().trim().min(3).max(200),
            price: z.coerce.number().positive(),
            costPrice: z.coerce.number().nonnegative().optional(),
            sku: z.string().trim().max(100).optional(),
            barcode: z.string().trim().max(100).optional(),
            variants: variants.optional(),
            category: z.string().trim().max(100).optional(),
            stock: z.coerce.number().int().nonnegative().optional(),
            lowStockThreshold: z.coerce.number().int().nonnegative().optional()
        })
    },
    update: {
        params: idParams,
        body: z.object({
            name: z.string().trim().min(3).max(200).optional(),
            price: z.coerce.number().positive().optional(),
            costPrice: z.coerce.number().nonnegative().optional(),
            sku: z.string().trim().max(100).optional(),
            barcode: z.string().trim().max(100).optional(),
            variants: variants.optional(),
            category: z.string().trim().max(100).optional(),
            lowStockThreshold: z.coerce.number().int().nonnegative().optional()
        })
    },
    list: {
        query: z.object({
            search: z.string().max(200).optional(),
            category: z.string().max(100).optional(),
            ...pagination,
            limit: z.coerce.number().int().positive().max(50).optional(),
            sort: z.enum(["name", "price", "createdAt"]).optional()
        })
    },
    byId: { params: idParams }
};

const inventory = {
    movement: {
        params: idParams,
        body: z.object({ quantity: z.coerce.number().int().positive(), variantSku: z.string().max(100).optional() })
    }
};

const order = {
    create: {
        body: z.object({
            products: z.array(z.object({
                product: objectId,
                variantSku: z.string().max(100).optional(),
                quantity: z.number().int().positive()
            })).min(1),
            userInfo: z.object({
                name: z.string().trim().min(1).max(200),
                number: z.string().regex(/^(0[567]\d{8}|\+213[567]\d{7})$/),
                city: z.string().trim().min(1).max(100),
                address: z.string().trim().min(1).max(300),
                delivery: z.enum(["Domicile", "Desk"])
            })
        })
    },
    list: {
        query: z.object({
            name: z.string().max(200).optional(),
            status: orderStatus.optional(),
            ...pagination,
            sort: z.enum(["totalPrice", "createdAt"]).optional()
        })
    },
    byId: { params: idParams },
    updateStatus: {
        params: idParams,
        body: z.object({ status: orderStatus })
    }
};

const dashboard = {
    products: { query: z.object({ date: z.string().max(50).optional() }) },
    orders: { query: z.object({ period: z.literal("30d").optional() }) }
};

const organization = {
    switch: { body: z.object({ organizationId: objectId }) },
    invite: {
        body: z.object({
            email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
            role: z.enum(["owner", "admin", "staff", "viewer"])
        })
    },
    acceptInvite: { body: z.object({ token: z.string().min(20).max(4096) }) },
    changeRole: {
        params: idParams,
        body: z.object({ role: z.enum(["owner", "admin", "staff", "viewer"]) })
    },
    byId: { params: idParams },
    audit: {
        query: z.object({
            action: z.string().max(100).optional(),
            entity: z.string().max(100).optional(),
            actor: objectId.optional(),
            ...pagination
        })
    }
};

const features = {
    export: { params: z.object({ type: z.enum(["products", "orders", "movements"]) }), query: z.object({ format: z.enum(["csv", "xlsx"]).default("csv") }) },
    sales: { query: z.object({ period: z.enum(["day", "week", "month"]).default("day") }) },
    movements: { query: z.object({ product: objectId.optional(), action: z.enum(["in", "out"]).optional(), ...pagination }) },
    document: { params: z.object({ id: objectId, type: z.enum(["invoice", "label"]) }) },
    byId: { params: idParams }
};
const apiKeys = {
    create: { body: z.object({ name: z.string().trim().min(2).max(100), scopes: z.array(z.enum(["read", "write"])).min(1), rateLimitPerMinute: z.number().int().min(1).max(10000).optional() }) },
    byId: { params: idParams }
};
const webhooks = {
    create: { body: z.object({ url: z.string().url().startsWith("https://"), events: z.array(z.enum(["order.created", "stock.low"])).min(1) }) },
    byId: { params: idParams }
};
const admin = {
    list: { query: z.object({ status: z.enum(["active", "suspended", "deletion_pending", "deleted"]).optional(), ...pagination }) },
    byId: { params: idParams },
    suspension: { params: idParams, body: z.object({ suspended: z.boolean() }) },
    impersonate: { body: z.object({ userId: objectId, organizationId: objectId }) }
};
const search = { query: z.object({ q: z.string().trim().min(1).max(200), limit: z.coerce.number().int().positive().max(50).optional() }) };
const account = { notifications: { body: z.object({ lowStockEmail: z.boolean().optional(), customerOrderEmails: z.boolean().optional(), lowStockChannel: z.enum(["none", "whatsapp", "sms"]).optional(), destination: z.string().trim().max(320).nullable().optional() }).refine((value) => value.lowStockChannel === "none" || !value.lowStockChannel || value.destination, { message: "A destination is required for SMS or WhatsApp" }) } };
const billing = {
    checkout: { body: z.object({ plan: z.enum(["pro", "business"]) }) },
    invoices: { query: z.object({ ...pagination }) }
};

module.exports = { auth, product, inventory, order, dashboard, organization, billing, features, apiKeys, webhooks, admin, search, account };
