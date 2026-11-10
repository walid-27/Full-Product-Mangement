const AnalyticsEvent = require("../models/AnalyticsEvent");

const track = async (event, { organization, user, ...properties } = {}) => {
    await AnalyticsEvent.create({ event, organization, user, properties });
};
module.exports = { track };
