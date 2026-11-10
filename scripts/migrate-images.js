const fs = require("fs/promises");
const path = require("path");
const mongoose = require("mongoose");
const { loadEnv } = require("../src/config/env");
const Product = require("../src/models/Product");
const Storage = require("../src/Services/Storage.Service");

const migrate = async () => {
    const config = loadEnv();
    await mongoose.connect(config.MONGO_URL);
    const products = await Product.find({ image: { $exists: true, $ne: null } });
    let migrated = 0;
    for (const product of products) {
        if (product.image.includes("/") || product.image.endsWith(".webp")) continue;
        const filePath = path.join(__dirname, "../uploads", path.basename(product.image));
        try {
            const buffer = await fs.readFile(filePath);
            product.image = await Storage.uploadImage({ buffer }, product.organization);
            await product.save();
            migrated += 1;
        } catch (err) {
            if (err.code !== "ENOENT") throw err;
        }
    }
    console.log(`Migrated ${migrated} product images.`);
};
migrate().catch((err) => { console.error(err); process.exitCode = 1; }).finally(() => mongoose.disconnect());
