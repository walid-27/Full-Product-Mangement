const dotenv = require("dotenv");
const { z } = require("zod");

dotenv.config({ quiet: true });

const envSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(5000),
    MONGO_URL: z.string().regex(/^mongodb(?:\+srv)?:\/\//, "MONGO_URL must be a MongoDB URI"),
    SECRET_JWT: z.string().min(32, "SECRET_JWT must contain at least 32 characters"),
    CORS_ORIGINS: z.string().default("http://localhost:3000,http://localhost:5173"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(15 * 60 * 1000),
    RATE_LIMIT_MAX: z.coerce.number().int().positive().default(300),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
    APP_URL: z.string().url().default("http://localhost:5000"),
    EMAIL_PROVIDER: z.enum(["console", "mock", "resend"]).default("console"),
    EMAIL_FROM: z.string().email().default("onboarding@resend.dev"),
    RESEND_API_KEY: z.string().optional(),
    BILLING_PROVIDER: z.enum(["mock", "chargily"]).default("mock"),
    CHARGILY_SECRET_KEY: z.string().optional(),
    CHARGILY_WEBHOOK_SECRET: z.string().optional(),
    CHARGILY_BASE_URL: z.string().url().default("https://pay.chargily.net/api/v2"),
    TRUST_PROXY: z.enum(["true", "false"]).default("false").transform((value) => value === "true")
});

let cachedEnv;

const validateEnv = (source = process.env) => {
    const result = envSchema.safeParse(source);
    if (!result.success) {
        const details = result.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; ");
        throw new Error(`Invalid environment configuration: ${details}`);
    }

    const origins = result.data.CORS_ORIGINS.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);

    if (origins.length === 0) {
        throw new Error("Invalid environment configuration: CORS_ORIGINS cannot be empty");
    }
    if (result.data.EMAIL_PROVIDER === "resend" && !result.data.RESEND_API_KEY) {
        throw new Error("Invalid environment configuration: RESEND_API_KEY is required for Resend");
    }
    if (result.data.BILLING_PROVIDER === "chargily" && (!result.data.CHARGILY_SECRET_KEY || !result.data.CHARGILY_WEBHOOK_SECRET)) {
        throw new Error("Invalid environment configuration: Chargily secret and webhook keys are required");
    }

    return {
        ...result.data,
        CORS_ORIGINS: origins
    };
};

const loadEnv = () => {
    if (!cachedEnv) cachedEnv = validateEnv();
    return cachedEnv;
};

const resetEnvCache = () => {
    cachedEnv = undefined;
};

module.exports = { loadEnv, validateEnv, resetEnvCache };
