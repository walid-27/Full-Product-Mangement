const { createHmac, randomUUID } = require("crypto");
const OutgoingWebhook = require("../models/OutgoingWebhook");

const dispatch = async (organization, event, payload) => {
    const hooks = await OutgoingWebhook.find({ organization, active: true, events: event }).lean();
    for (const hook of hooks) {
        try {
            await require("../jobs/queues").enqueue("webhook", { webhookId: hook._id, event, payload });
        } catch (err) {
            console.error(JSON.stringify({ level: "warn", message: "Outgoing webhook queued/delivered unsuccessfully", webhookId: hook._id }));
        }
    }
    return hooks.length;
};
const deliver = async ({ webhookId, event, payload }) => {
    const hook = await OutgoingWebhook.findById(webhookId);
    if (!hook?.active) return false;
    const body = JSON.stringify({ id: randomUUID(), event, createdAt: new Date().toISOString(), data: payload });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac("sha256", hook.secret).update(`${timestamp}.${body}`).digest("hex");
    let lastError;
    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            const response = await fetch(hook.url, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-saas-timestamp": timestamp, "x-saas-signature": signature },
                body,
                signal: AbortSignal.timeout(5000)
            });
            if (response.ok) return true;
            lastError = new Error(`Webhook returned ${response.status}`);
        } catch (err) { lastError = err; }
        await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
    throw lastError;
};
module.exports = { dispatch, deliver };
