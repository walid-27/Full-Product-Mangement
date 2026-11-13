module.exports = {
    testEnvironment: "node",
    roots: ["<rootDir>/tests"],
    testMatch: [
        "<rootDir>/tests/security.test.js",
        "<rootDir>/tests/permissions.test.js",
        "<rootDir>/tests/account-unit.test.js",
        "<rootDir>/tests/auth-pages-unit.test.js",
        "<rootDir>/tests/billing-unit.test.js",
        "<rootDir>/tests/platform-unit.test.js",
        "<rootDir>/tests/admin-gdpr-unit.test.js",
        "<rootDir>/tests/import-jobs-unit.test.js"
    ],
    setupFilesAfterEnv: ["<rootDir>/tests/unitSetup.js"]
};
