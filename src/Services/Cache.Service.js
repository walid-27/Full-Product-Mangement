const { loadEnv } = require("../config/env");

const memory = new Map();
let redis;
const getRedis = () => {
    if (!redis) {
        const Redis = require("ioredis");
        redis = new Redis(loadEnv().REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
        redis.connect().catch(() => {});
    }
    return redis;
};
const useRedis = () => loadEnv().QUEUE_ENABLED;
const keyFor = (organization, key) => `tenant:${organization}:${key}`;

const get = async (organization, key) => {
    const fullKey = keyFor(organization, key);
    if (useRedis()) {
        const value = await getRedis().get(fullKey);
        return value ? JSON.parse(value) : null;
    }
    const entry = memory.get(fullKey);
    if (!entry || entry.expiresAt < Date.now()) return null;
    return entry.value;
};
const set = async (organization, key, value, ttlSeconds = 60) => {
    const fullKey = keyFor(organization, key);
    if (useRedis()) return getRedis().set(fullKey, JSON.stringify(value), "EX", ttlSeconds);
    memory.set(fullKey, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
    return value;
};
const invalidateOrganization = async (organization) => {
    const prefix = keyFor(organization, "");
    if (useRedis()) {
        const keys = await getRedis().keys(`${prefix}*`);
        if (keys.length) await getRedis().del(keys);
        return;
    }
    for (const key of memory.keys()) if (key.startsWith(prefix)) memory.delete(key);
};
const cached = async (organization, key, producer, ttlSeconds = 60) => {
    const existing = await get(organization, key);
    if (existing) return existing;
    const value = await producer();
    await set(organization, key, value, ttlSeconds);
    return value;
};

module.exports = { get, set, cached, invalidateOrganization };
