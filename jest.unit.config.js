module.exports = {
    testEnvironment: "node",
    roots: ["<rootDir>/tests"],
    testMatch: ["<rootDir>/tests/security.test.js", "<rootDir>/tests/permissions.test.js"],
    setupFilesAfterEnv: ["<rootDir>/tests/unitSetup.js"]
};
