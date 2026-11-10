const { randomUUID } = require("crypto");
const { signatureFor } = require("./ChargilyProvider");

class MockProvider {
    constructor(config) { this.config = config; }
    async createCheckout() {
        const id = `mock_checkout_${randomUUID()}`;
        return { id, url: `${this.config.APP_URL}/billing/mock-checkout/${id}`, raw: { id } };
    }
    async getPortalUrl() { return `${this.config.APP_URL}/billing`; }
    verifyWebhook(rawBody, signature) {
        return signatureFor(rawBody, this.config.CHARGILY_WEBHOOK_SECRET || "") === signature;
    }
}

module.exports = MockProvider;
