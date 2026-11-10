const mongoose = require("mongoose");

const InventorySchema = new mongoose.Schema({
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
    product: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    action: { type: String, enum: ["in", "out"], required: true },
    quantity: {
        type: Number,
        required: true,
        min: [1, "Quantity must be at least 1"],
        validate: { validator: Number.isInteger, message: "Quantity must be an integer" }
    },
    stockBefore: { type: Number, required: true, min: 0 },
    stockAfter: { type: Number, required: true, min: 0 }
}, { timestamps: true, versionKey: false });

InventorySchema.index({ organization: 1, product: 1, createdAt: -1 });
InventorySchema.index({ organization: 1, action: 1, createdAt: -1 });

module.exports = mongoose.model("StockMovement", InventorySchema);
