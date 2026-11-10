const { randomBytes } = require("crypto");
const ApiKey = require("../models/ApiKey");
const { hashToken } = require("../utils/tokens");

const create = async (organization, data) => {
    const raw = `sk_${randomBytes(32).toString("base64url")}`;
    const key = await ApiKey.create({
        organization, name: data.name, prefix: raw.slice(0, 12), keyHash: hashToken(raw),
        scopes: data.scopes, rateLimitPerMinute: data.rateLimitPerMinute || 60
    });
    return { id: key._id, name: key.name, key: raw, scopes: key.scopes };
};
const list = async (organization) => ApiKey.find({ organization, revokedAt: null }).select("-keyHash").lean();
const revoke = async (organization, id) => ApiKey.findOneAndUpdate({ _id: id, organization, revokedAt: null }, { $set: { revokedAt: new Date() } }, { new: true });
module.exports = { create, list, revoke };
