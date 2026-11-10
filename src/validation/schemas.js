const { z } = require("zod");

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid resource identifier");
const pagination = {
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional()
};
const orderStatus = z.enum(["cancelled", "delivered", "confirmed", "pending", "shipped"]);
const idParams = z.object({ id: objectId });

const auth = {
    register: {
        body: z.object({
            name: z.string().trim().min(2).max(100),
            email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
            password: z.string().min(8).max(72)
        })
    },
    login: {
        body: z.object({
            email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
            password: z.string().min(1).max(72)
        })
    }
};

const product = {
    create: {
        body: z.object({
            name: z.string().trim().min(3).max(200),
            price: z.coerce.number().positive(),
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
        body: z.object({ quantity: z.coerce.number().int().positive() })
    }
};

const order = {
    create: {
        body: z.object({
            products: z.array(z.object({
                product: objectId,
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

module.exports = { auth, product, inventory, order, dashboard };
