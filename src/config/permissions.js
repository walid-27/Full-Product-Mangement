const ROLE_PERMISSIONS = Object.freeze({
    viewer: ["read"],
    staff: ["read", "products:write", "orders:write", "stock:write"],
    admin: ["read", "products:write", "orders:write", "stock:write", "team:write", "audit:read"],
    owner: ["read", "products:write", "orders:write", "stock:write", "team:write", "audit:read", "billing:write", "organization:delete"]
});

const hasPermission = (role, permission) => Boolean(ROLE_PERMISSIONS[role]?.includes(permission));

module.exports = { ROLE_PERMISSIONS, hasPermission };
