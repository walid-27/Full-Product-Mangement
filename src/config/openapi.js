const paths = {};
const endpoints = [
    ["/auth/register", "post"], ["/auth/login", "post"], ["/auth/refresh", "post"], ["/auth/logout", "post"],
    ["/auth/verify-email", "post"], ["/auth/verify-email", "get"], ["/auth/reset-password", "get"], ["/auth/reset-password", "post"], ["/auth/forgot-password", "post"], ["/auth/resend-verification", "post"], ["/auth/logout-all", "post"],
    ["/api/v1/products", "get"], ["/api/v1/orders", "get"], ["/api/v1/orders", "post"],
    ["/api/product", "get"], ["/api/product", "post"], ["/api/order", "get"], ["/api/order", "post"],
    ["/api/organizations", "get"], ["/api/organizations/invites", "post"], ["/api/organizations/audit-logs", "get"],
    ["/api/billing/subscription", "get"], ["/api/billing/checkout", "post"], ["/api/billing/invoices", "get"],
    ["/api/features/export/{type}", "get"], ["/api/features/reports/sales", "get"],
    ["/api/features/reports/best-sellers", "get"], ["/api/features/reports/stock", "get"],
    ["/api/search", "get"], ["/health", "get"], ["/health/live", "get"], ["/health/ready", "get"], ["/metrics", "get"],
    ["/api/v1/public/products", "get"], ["/api/v1/public/orders", "get"], ["/api/v1/public/orders", "post"],
    ["/api/api-keys", "get"], ["/api/api-keys", "post"], ["/api/api-keys/{id}", "delete"],
    ["/api/webhooks", "get"], ["/api/webhooks", "post"], ["/api/webhooks/{id}", "delete"],
    ["/api/features/products/import", "post"], ["/api/features/reports/movements", "get"],
    ["/api/features/orders/{id}/documents/{type}", "get"], ["/api/features/orders/{id}/shipment", "post"],
    ["/api/product/{id}/restore", "post"], ["/api/order/{id}/restore", "post"],
    ["/api/account/export", "get"], ["/api/account", "delete"], ["/api/account/notifications", "patch"], ["/api/account/onboarding", "get"],
    ["/api/admin/tenants", "get"], ["/api/admin/tenants/{id}/usage", "get"], ["/api/admin/tenants/{id}/suspension", "patch"], ["/api/admin/impersonate", "post"]
];
for (const [path, method] of endpoints) {
    paths[path] = paths[path] || {};
    paths[path][method] = { summary: `${method.toUpperCase()} ${path}`, responses: { 200: { description: "Success" }, 422: { description: "Validation error" } } };
}
module.exports = {
    openapi: "3.0.3",
    info: { title: "Full Product Management SaaS API", version: "1.0.0" },
    servers: [{ url: "/" }],
    components: { securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" }, apiKey: { type: "apiKey", in: "header", name: "x-api-key" } } },
    paths
};
