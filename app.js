const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const pinoHttp = require("pino-http");
const cookieParser = require("cookie-parser");
const { randomUUID } = require("crypto");
const GlobalMiddleware = require("./src/middleware/GlobalMiddleware");
const NotFoundMiddleware = require("./src/middleware/NotFoundMiddleware");
const createRateLimiter = require("./src/middleware/rateLimit");
const createLogger = require("./src/config/logger");
const { loadEnv } = require("./src/config/env");
const AuthRoute = require("./src/routes/Auth.Route");
const ProductRoute = require("./src/routes/Product.Route");
const InventoryRoute = require("./src/routes/Inventory.route");
const OrdersRoute = require("./src/routes/Orders.route");
const DashboardRoute = require("./src/routes/DashBoard.route");
const HealthRoute = require("./src/routes/Health.route");
const OrganizationRoute = require("./src/routes/Organization.route");
const BillingRoute = require("./src/routes/Billing.route");
const BillingWebhookRoute = require("./src/routes/BillingWebhook.route");

const createApp = (options = {}) => {
    const config = options.config || loadEnv();
    const logger = options.logger || createLogger(config);
    const app = express();

    app.set("env", config.NODE_ENV);
    app.set("trust proxy", config.TRUST_PROXY);
    app.disable("x-powered-by");

    app.use(helmet());
    app.use(pinoHttp({
        logger,
        genReqId: () => randomUUID(),
        autoLogging: { ignore: (req) => req.url === "/health" }
    }));
    app.use((req, res, next) => {
        res.setHeader("x-request-id", req.id);
        next();
    });
    app.use(cors({
        credentials: true,
        origin(origin, callback) {
            if (!origin || config.CORS_ORIGINS.includes("*") || config.CORS_ORIGINS.includes(origin)) {
                return callback(null, true);
            }
            const error = new Error("Origin is not allowed by CORS");
            error.statusCode = 403;
            error.code = "CORS_FORBIDDEN";
            return callback(error);
        }
    }));
    app.use("/api/billing/webhook", BillingWebhookRoute);
    app.use(express.json({ limit: "1mb" }));
    app.use(cookieParser());

    app.use("/health", HealthRoute(options.isDatabaseReady));
    app.use(createRateLimiter({
        windowMs: options.rateLimitWindowMs || config.RATE_LIMIT_WINDOW_MS,
        max: options.rateLimitMax || config.RATE_LIMIT_MAX
    }));
    app.use("/auth", createRateLimiter({
        windowMs: options.rateLimitWindowMs || config.RATE_LIMIT_WINDOW_MS,
        max: options.authRateLimitMax || config.AUTH_RATE_LIMIT_MAX
    }), AuthRoute);
    app.use("/api/product", ProductRoute);
    app.use("/api/quantity", InventoryRoute);
    app.use("/api/order", OrdersRoute);
    app.use("/api/dashboard", DashboardRoute);
    app.use("/api/organizations", OrganizationRoute);
    app.use("/api/billing", BillingRoute);
    app.use(NotFoundMiddleware);
    app.use(GlobalMiddleware);

    return app;
};

const app = createApp();
module.exports = app;
module.exports.createApp = createApp;
