const mongoose = require("mongoose");

const variantSchema = new mongoose.Schema({
    sku: { type: String, required: true, trim: true },
    size: { type: String, trim: true },
    color: { type: String, trim: true },
    stock: { type: Number, required: true, min: 0, default: 0 }
}, { _id: false });
const productSchema = new mongoose.Schema({
    name: { type: String, required: true, minlength: 3, trim: true },
    price: { type: Number, required: true, min: 0 },
    costPrice: { type: Number, min: 0, default: 0 },
    category: { type: String, trim: true },
    sku: { type: String, trim: true },
    barcode: { type: String, trim: true },
    variants: { type: [variantSchema], default: [] },
    stock: { type: Number, required: true, min: 0, default: 0 },
    organization: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true },
    image: { type: String, default: null },
    lowStockThreshold: { type: Number, default: 5, min: 0 },
    deletedAt: { type: Date, default: null }
}, { timestamps: true });

productSchema.index({ name: 1, organization: 1 }, { unique: true });
productSchema.index({ organization: 1, createdAt: -1 });
productSchema.index({ organization: 1, category: 1 });
productSchema.index({ organization: 1, sku: 1 }, { unique: true, sparse: true });
productSchema.index({ organization: 1, barcode: 1 }, { unique: true, sparse: true });
productSchema.index({ organization: 1, deletedAt: 1 });

module.exports = mongoose.model("Product", productSchema);
