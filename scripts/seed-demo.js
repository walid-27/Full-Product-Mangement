const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const { loadEnv } = require("../src/config/env");
const Auth = require("../src/models/Auth");
const Organization = require("../src/models/Organization");
const Membership = require("../src/models/Membership");
const Product = require("../src/models/Product");

const seed = async () => {
    if (!process.env.SEED_PASSWORD || process.env.SEED_PASSWORD.length < 12) throw new Error("SEED_PASSWORD with 12+ characters is required");
    const config = loadEnv();
    await mongoose.connect(config.MONGO_URL);
    const email = "demo@example.com";
    let user = await Auth.findOne({ email });
    if (!user) user = await Auth.create({ name: "Demo Owner", email, password: await bcrypt.hash(process.env.SEED_PASSWORD, 12), emailVerifiedAt: new Date() });
    let organization = await Organization.findOne({ slug: "demo-organization" });
    if (!organization) organization = await Organization.create({ name: "Demo Organization", slug: "demo-organization" });
    await Membership.findOneAndUpdate({ user: user._id, organization: organization._id }, { $set: { role: "owner", status: "active" } }, { upsert: true });
    await Product.findOneAndUpdate({ organization: organization._id, name: "Demo product" }, { $set: { price: 100, costPrice: 60, stock: 10, image: null } }, { upsert: true });
    console.log("Demo data seeded for demo@example.com.");
};
seed().catch((err) => { console.error(err.message); process.exitCode = 1; }).finally(() => mongoose.disconnect());
