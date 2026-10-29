const mongoose  = require('mongoose')
const Product = require('../models/Product')
const StockMovement = require("../models/inventroy");
const AppError = require('../utils/AppError');

   
    const StockIn = async(data, productId, userId)=>{

        const {quantity } = data;
        
        if(quantity <= 0 || !Number.isInteger(quantity)) throw new AppError("quantity invalid", 400)
        const session = await mongoose.startSession();

        try{
            await session.startTransaction();

        const findProduct = await Product.findOne({
            owner: userId,
            _id: productId

        }).session(session)
        if (!findProduct) throw new AppError("this product no found it", 400)
        const stockBefore = findProduct.stock;
        const stockAfter = findProduct.stock + quantity;


        findProduct.stock = stockAfter


        
            const [createMovment] = await StockMovement.create(
           [{ owner: userId,
            product: productId,
            action: "in",
            quantity: quantity,
            stockBefore: stockBefore,
            stockAfter: stockAfter
            }],
            {session}
        )
        
        await findProduct.save({session});

        await session.commitTransaction();

        return createMovment
        }catch(err){
            await session.abortTransaction();
            throw err
        }finally{
            await session.endSession();
        }


        
    }



    module.exports = {
        StockIn
    }