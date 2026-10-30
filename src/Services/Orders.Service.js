const mongoose = require("mongoose");
const Order = require("../models/Order");
const Product = require("../models/Product");
const AppError = require("../utils/AppError");
const inventroy = require("../Services/Inventory.Service")

    const createOrder = async(data, userId)=>{
        const {products, userInfo} = data;

        if(!Array.isArray(products) || products.length == 0 ) throw new AppError("Any Product selected", 400);

        if(!userInfo ) throw new AppError("Please Complete your Form ", 400);

        const productsID = products.map(prdct=> prdct.product) 

        const FoundProducts = await  Product.find({
            owner: userId,
            _id: { $in : productsID}
        })

        const uniqueProductIds = new Set(productsID.map(id => id.toString()));

            if (uniqueProductIds.size !== productsID.length) {
            throw new AppError("Duplicate products are not allowed", 400);
            }

        for (const requestQuntity of products) {
            if (
                !Number.isInteger(requestQuntity.quantity) ||
                requestQuntity.quantity <= 0
            ) {
                throw new AppError("Quantity must be a positive integer", 400);
            }

            const prdct = FoundProducts.find(
                item => item._id.toString() === requestQuntity.product.toString()
            );

            if (requestQuntity.quantity > prdct.stock) {
                throw new AppError(`Insufficient stock for ${prdct.name}`, 400);
            }
        }
       

         const totalPrice =  products.reduce((total, reqItem)=>{
            const product = FoundProducts.find(
                item => item._id.toString() === reqItem.product.toString()
            )

            return total + product.price * reqItem.quantity
        }, 0)
        

        const orderProduct = products.map(reqItem => {
            const product = FoundProducts.find(
                item => item._id.toString() === reqItem.product.toString()
            )
            return {
                product: product._id,
                quantity: reqItem.quantity,
                price: product.price
            };
        });
        // now transition time

        const session = await mongoose.startSession();
            const StockOut = inventroy.StockOut;
        try{
            const createOrder = await session.withTransaction(async ()=>{

                 for(const prdct of orderProduct){
                    await StockOut( { quantity: prdct.quantity },
                        prdct.product,
                        userId,
                        session
                    );
                }

                const [order] = await Order.create(
                [{
                    owner: userId,
                    products: orderProduct,
                    userInfo: { 
                        name: userInfo.name,
                        number: userInfo.number,
                        city: userInfo.city,
                        address: userInfo.address,
                        delivery: userInfo.delivery
                    },
                        totalPrice: totalPrice,
                        status: "pending"
                    }]
                    ,{session}
            
            )

                return order;
            });
               

        return createdOrder;
        }finally {
            await session.endSession();
        } 
                
    
        

        
    }

    module.exports = {
        createOrder 

    }