const PLANS = Object.freeze({
    free: {
        priceDzd: 0, maxProducts: 25, maxOrdersPerMonth: 50, maxTeamMembers: 2,
        features: { apiAccess: false, csvExport: false, reports: false }
    },
    pro: {
        priceDzd: 3000, maxProducts: 1000, maxOrdersPerMonth: 5000, maxTeamMembers: 10,
        features: { apiAccess: true, csvExport: true, reports: true }
    },
    business: {
        priceDzd: 9000, maxProducts: null, maxOrdersPerMonth: null, maxTeamMembers: null,
        features: { apiAccess: true, csvExport: true, reports: true }
    }
});

const getPlan = (name) => PLANS[name] || PLANS.free;
const withinLimit = (usage, limit) => limit === null || usage < limit;

module.exports = { PLANS, getPlan, withinLimit };
