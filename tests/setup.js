const mongoose = require("mongoose");
const os = require("os");
require("dotenv").config({
    path: require("path").resolve(__dirname, "../../.env")
});
jest.setTimeout(15000);

beforeAll(async () => {

    await mongoose.connect(
        "mongodb://127.0.0.1:27017/full_product_api_test",
        {
            serverSelectionTimeoutMS: 5000,
            runtimeAdapters: {
            os: require("os")
        }
        }
    );

});

beforeEach(async () => {
    const collections = mongoose.connection.collections;

    for (const collection of Object.values(collections)) {
        await collection.deleteMany({});
    }
});

afterAll(async () => {
    await mongoose.disconnect();
});