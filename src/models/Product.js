const mongoose = require('mongoose')

    const productSchema = new mongoose.Schema({
        name: {
            type: String,
            required: true,
            minlength: 3,
        },
        price: {
            type: Number,
            required: true,
            min: 0,

        },
        category: {
            type: String,
        },
        stock: {
            type: Number,
            required: true,
            min: 0,
            default: 0
        },
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "AuthModel",
            required: true,}
        ,
        image: {
            type: String,
            required: true
        },
        lowStockThreshold: {
            type: Number,
            default: 5,
            min: 0
            }
    },{
        timestamps: true
    }
    
)

productSchema.index(
    { name: 1, owner: 1 },
    { unique: true }
);  

    const Product = mongoose.model("Product", productSchema)
module.exports = Product