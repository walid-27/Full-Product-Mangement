const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
    name: { type: String, required: true, minlength: 3, trim: true },
    price: { type: Number, required: true, min: 0 },
    category: { type: String, trim: true },
    stock: { type: Number, required: true, min: 0, default: 0 },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
    image: { type: String, required: true },
    lowStockThreshold: { type: Number, default: 5, min: 0 }
}, { timestamps: true });

productSchema.index({ name: 1, organization: 1 }, { unique: true });
productSchema.index({ organization: 1, createdAt: -1 });
productSchema.index({ organization: 1, category: 1 });

module.exports = mongoose.model("Product", productSchema);
