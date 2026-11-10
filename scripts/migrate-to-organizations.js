const mongoose = require("mongoose");
const { loadEnv } = require("../src/config/env");
const Auth = require("../src/models/Auth");
const Organization = require("../src/models/Organization");
const Membership = require("../src/models/Membership");
const Product = require("../src/models/Product");
const Order = require("../src/models/Order");
const StockMovement = require("../src/models/Inventory");

const migrate = async () => {
    const config = loadEnv();
    await mongoose.connect(config.MONGO_URL);
    const db = mongoose.connection.db;
    const ownerIds = new Set();
    for (const name of ["products", "orders", "stockmovements"]) {
        const ids = await db.collection(name).distinct("owner", { owner: { $exists: true } });
        for (const id of ids) ownerIds.add(id.toString());
    }

    try { await db.collection("products").dropIndex("name_1_owner_1"); } catch (err) {
        if (err.codeName !== "IndexNotFound") throw err;
    }

    for (const ownerId of ownerIds) {
        const user = await Auth.findById(ownerId).lean();
        if (!user) throw new Error(`Cannot migrate orphaned owner ${ownerId}`);
        let membership = await Membership.findOne({ user: user._id, role: "owner" }).sort({ createdAt: 1 });
        let organization;
        if (membership) {
            organization = await Organization.findById(membership.organization);
        } else {
            organization = await Organization.create({
                name: `${user.name}'s Organization`,
                slug: `org-${user._id}`
            });
            membership = await Membership.create({
                user: user._id, organization: organization._id, role: "owner", status: "active"
            });
        }
        for (const name of ["products", "orders", "stockmovements"]) {
            await db.collection(name).updateMany({ owner: user._id }, {
                $set: { organization: organization._id },
                $unset: { owner: "" }
            });
        }
    }

    await Promise.all([Product.syncIndexes(), Order.syncIndexes(), StockMovement.syncIndexes()]);
    console.log(`Migrated ${ownerIds.size} user-owned tenant(s).`);
};

migrate()
    .catch((err) => { console.error(err); process.exitCode = 1; })
    .finally(() => mongoose.disconnect());
