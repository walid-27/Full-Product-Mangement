const { loadEnv } = require("../../config/env");
const { ChargilyProvider } = require("./ChargilyProvider");
const MockProvider = require("./MockProvider");

const getPaymentProvider = () => {
    const config = loadEnv();
    return config.BILLING_PROVIDER === "chargily" ? new ChargilyProvider(config) : new MockProvider(config);
};

module.exports = { getPaymentProvider };
