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
        minStock:{
            type:Number,
            min: 0,
            default: 5
        },
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,}
        ,
        image: {
            type: String,
            required: true
        }
    },{
        timestamps: true
    }
    
)

productSchema.index(
    { name: 1, owner: 1 },
    { unique: true }
);  

    Product = mongoose.model("Product", productSchema)
module.exports = Product