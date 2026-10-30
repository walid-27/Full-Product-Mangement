const mongoose = require("mongoose")

    const OrderSchema = new mongoose.Schema({
        owner: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        products: [
            {
                product: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Product",
                    required: true
                },
                quantity: {
                    type: Number,
                    required: true,
                    min: 1
                },
                price: {
                    type: Number,
                    required: true,
                    min: 0
                }
            }
        ],
        userInfo: {
            name: {
                type: String,
                required: true,
            },
            number: {
            type: String,
            required: [true, "Phone number is required"],
            match: [
                /^(0[567]\d{8}|\+213[567]\d{7})$/,
                "Invalid Algerian phone number"
            ]
            },
            city:{
                type: String,
                required: true
            },
            address:{
                type: String,
                required: true
            },
            delivery: {
                type: String,
                required: true,
                enum: ["Domicile", "Desk"]
            }
        },
            totalPrice: {
                type: Number,
                required: true
            },
            status: {
                type: String,
                enum: ["cancelled", "delivered", "confirmed", "pending"],
                required: true
            }
    
    },
    {
        timestamps: true
    }
)


module.exports = mongoose.model("Order", OrderSchema)