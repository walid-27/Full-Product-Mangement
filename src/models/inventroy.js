const mongoose = require("mongoose");

    const InventorySchema = new mongoose.Schema({
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true
        },
        action: {
            type: String,
            enum: ["in", "out"],
            required: true
        },
            quantity:{
        type: Number,
        required: true,
        min: [1, "Quantity must be at least 1"],
        validate: {
            validator: Number.isInteger,
            message: "Quantity must be an integer"
        }
        },  
        stockBefore: {
            type: Number,
            required: true,
            min: 0,
        },
        stockAfter: {
            type: Number,
            required: true,
            min: 0
        }

    },
    {
        timestamps: true,
        versionKey: false
    })


// // Useful for a user's product movement history
InventorySchema.index({
  owner: 1,
  product: 1,
  createdAt: -1
});

// // Useful for inventory reports
InventorySchema.index({
  owner: 1,
  type: 1,
  createdAt: -1
});

module.exports = mongoose.model(
  "StockMovement",
  InventorySchema
);
