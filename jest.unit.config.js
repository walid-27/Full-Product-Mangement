module.exports = {
    testEnvironment: "node",
    roots: ["<rootDir>/tests"],
    testMatch: [
        "<rootDir>/tests/security.test.js",
        "<rootDir>/tests/permissions.test.js",
        "<rootDir>/tests/account-unit.test.js",
        "<rootDir>/tests/billing-unit.test.js"
    ],
    setupFilesAfterEnv: ["<rootDir>/tests/unitSetup.js"]
};
