const { hasPermission } = require("../src/config/permissions");
const requireRole = require("../src/middleware/requireRole");

describe("organization permission matrix", () => {
    test("viewer is read-only and staff cannot manage teams or billing", () => {
        expect(hasPermission("viewer", "read")).toBe(true);
        expect(hasPermission("viewer", "products:write")).toBe(false);
        expect(hasPermission("staff", "products:write")).toBe(true);
        expect(hasPermission("staff", "orders:write")).toBe(true);
        expect(hasPermission("staff", "stock:write")).toBe(true);
        expect(hasPermission("staff", "team:write")).toBe(false);
        expect(hasPermission("admin", "team:write")).toBe(true);
        expect(hasPermission("admin", "billing:write")).toBe(false);
        expect(hasPermission("owner", "billing:write")).toBe(true);
        expect(hasPermission("owner", "organization:delete")).toBe(true);
    });

    test("requireRole returns 403 without executing the handler", () => {
        const next = jest.fn();
        requireRole("owner", "admin")({ membership: { role: "staff" } }, {}, next);
        expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: "ROLE_FORBIDDEN" }));
    });
});
