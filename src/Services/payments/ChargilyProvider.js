const { createHmac, timingSafeEqual } = require("crypto");
const AppError = require("../../utils/AppError");

const signatureFor = (rawBody, secret) => createHmac("sha512", secret).update(rawBody).digest("hex");

class ChargilyProvider {
    constructor(config) { this.config = config; }

    async createCheckout({ organization, plan, amountDzd }) {
        const response = await fetch(`${this.config.CHARGILY_BASE_URL}/checkouts`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${this.config.CHARGILY_SECRET_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                amount: amountDzd,
                currency: "dzd",
                success_url: `${this.config.APP_URL}/billing/success`,
                failure_url: `${this.config.APP_URL}/billing/cancel`,
                metadata: { organizationId: organization.toString(), plan }
            }),
            signal: AbortSignal.timeout(10000)
        });
        const body = await response.json();
        if (!response.ok) throw new AppError("Unable to create payment checkout", 502, "PAYMENT_PROVIDER_ERROR");
        return { id: body.id, url: body.checkout_url, raw: body };
    }

    async getPortalUrl() { return `${this.config.APP_URL}/billing`; }

    verifyWebhook(rawBody, signature) {
        if (!signature || !this.config.CHARGILY_WEBHOOK_SECRET) return false;
        const expected = Buffer.from(signatureFor(rawBody, this.config.CHARGILY_WEBHOOK_SECRET));
        const received = Buffer.from(signature);
        return expected.length === received.length && timingSafeEqual(expected, received);
    }
}

module.exports = { ChargilyProvider, signatureFor };
