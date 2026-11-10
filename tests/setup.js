const mongoose = require("mongoose");
const { MongoMemoryReplSet } = require("mongodb-memory-server");
require("dotenv").config({
    path: require("path").resolve(__dirname, "../.env")
});

process.env.SECRET_JWT = process.env.SECRET_JWT || "test-secret";
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
