const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
require("dotenv").config({
    path: require("path").resolve(__dirname, "../.env"),
    quiet: true
});

process.env.NODE_ENV = "test";
process.env.MONGO_URL = "mongodb://127.0.0.1:27017/full_product_api_test";
process.env.SECRET_JWT = "test-only-jwt-secret-with-at-least-32-characters";
process.env.LOG_LEVEL = "silent";
process.env.EMAIL_PROVIDER = "mock";
process.env.APP_URL = "http://localhost:5000";
process.env.AUTH_RATE_LIMIT_MAX = "1000";
process.env.BILLING_PROVIDER = "mock";
process.env.CHARGILY_WEBHOOK_SECRET = "test-only-webhook-secret";
jest.setTimeout(60000);

let replSet;

beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({
        replSet: {
            count: 1,
            storageEngine: "wiredTiger"
        }
    });

    await mongoose.connect(replSet.getUri(), {
        dbName: "full_product_api_test"
    });
});

beforeEach(async () => {
    const collections = mongoose.connection.collections;
    for (const collection of Object.values(collections)) {
        await collection.deleteMany({});
    }
});

afterAll(async () => {
    await mongoose.disconnect();
    if (replSet) await replSet.stop();
});
