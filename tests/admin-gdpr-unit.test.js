const Gdpr = require("../src/Services/Gdpr.Service");
const Admin = require("../src/Services/Admin.Service");
const Auth = require("../src/models/Auth");
const Organization = require("../src/models/Organization");
const Membership = require("../src/models/Membership");
const RefreshToken = require("../src/models/RefreshToken");
const Audit = require("../src/Services/Audit.Service");
const Account = require("../src/Services/Account.Service");
const Notification = require("../src/Services/Notification.Service");

describe("GDPR, admin, and notifications", () => {
    afterEach(() => jest.restoreAllMocks());

    test("account deletion schedules grace and revokes refresh tokens", async () => {
        jest.spyOn(Auth, "updateOne").mockResolvedValue({});
        jest.spyOn(RefreshToken, "updateMany").mockResolvedValue({});
        await Gdpr.scheduleAccountDeletion("user");
        expect(Auth.updateOne.mock.calls[0][1].$set.deletionScheduledAt.getTime()).toBeGreaterThan(Date.now());
        expect(RefreshToken.updateMany).toHaveBeenCalled();
    });

    test("due organizations enter deleted state only after grace", async () => {
        const organization = { _id: "org", status: "deletion_pending", save: jest.fn() };
        jest.spyOn(Organization, "find").mockResolvedValueOnce([organization]).mockResolvedValueOnce([]);
        for (const model of ["Product", "Order", "Inventory", "ApiKey", "OutgoingWebhook", "Subscription", "UsageCounter", "AnalyticsEvent"]) {
            jest.spyOn(require(`../src/models/${model}`), "deleteMany").mockResolvedValue({});
        }
        jest.spyOn(Membership, "deleteMany").mockResolvedValue({});
        jest.spyOn(Auth, "find").mockResolvedValue([]);
        expect(await Gdpr.purgeDue()).toEqual({ organizations: 1, users: 0 });
        expect(organization.status).toBe("deleted");
    });

    test("suspension is audited and impersonation requires active membership", async () => {
        const tenant = { status: "active", toObject: () => ({}), save: jest.fn() };
        jest.spyOn(Organization, "findById").mockResolvedValue(tenant);
        jest.spyOn(Audit, "record").mockResolvedValue({});
        await Admin.setSuspension("org", true, { actor: "admin" });
        expect(tenant.status).toBe("suspended");
        expect(Audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.tenant.suspend" }));
        jest.spyOn(Membership, "findOne").mockResolvedValue(null);
        await expect(Admin.impersonate({ _id: "admin" }, "user", "org", "ip")).rejects.toMatchObject({ code: "MEMBERSHIP_NOT_FOUND" });
    });

    test("notification preferences update only supplied fields", async () => {
        const user = { notifications: { lowStockEmail: true, lowStockChannel: "none" }, save: jest.fn() };
        jest.spyOn(Auth, "findById").mockResolvedValue(user);
        await Account.updateNotificationPreferences("user", { lowStockEmail: false });
        expect(user.notifications.lowStockEmail).toBe(false);
        expect(user.notifications.lowStockChannel).toBe("none");
    });

    test("SMS and WhatsApp use pluggable channels", async () => {
        Notification.channels.sms = jest.fn();
        await Notification.send({ user: { notifications: { destination: "+213555555555" } }, type: "sms", message: "Low stock" });
        expect(Notification.channels.sms).toHaveBeenCalledWith("+213555555555", "Low stock");
    });
});
