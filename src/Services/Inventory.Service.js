const mongoose  = require('mongoose')
const Product = require('../models/Product')
const StockMovement = require("../models/inventroy");
const AppError = require('../utils/AppError');
const { ReturnDocument } = require('mongodb');

   
    const StockIn = async(data, productId, userId)=>{

        const { quantity } = data ?? {};
        
        if(quantity <= 0 || !Number.isInteger(quantity)) throw new AppError("Quantity must be a positive integer", 400)
        const session = await mongoose.startSession();

        try{
            await session.startTransaction();

        const findProduct = await Product.findOne({
            owner: userId,
            _id: productId

        },
        
    ).session(session)
        if (!findProduct) throw new AppError("this product no found it", 404    )
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

    const StockOut = async(data, productId, userId, session=null )=>{

        const {quantity} = data
        
        
        if( typeof quantity !== "number"  || quantity <= 0 || !Number.isInteger(quantity)) throw new AppError("Quantity must be a positive integer", 400)
        
        const ownSession = !session;

              

        try{
             if (ownSession) {
            session = await mongoose.startSession();
            session.startTransaction();}  

        const updatedProduct = await Product.findOneAndUpdate(
        {
            owner: userId,
            _id: productId,
            stock: { $gte: quantity }
        },
        {
            $inc: { stock: -quantity }
        },
        {
            returnDocument: "before",
            session
        }
        );

        if (!updatedProduct) {
        const productExists = await Product.exists({
            owner: userId,
            _id: productId
        }).session(session);

        if (!productExists) {
            throw new AppError("Product not found", 404);
        }

        throw new AppError("Insufficient stock", 409);
        }

        const stockBefore = updatedProduct.stock;
        const stockAfter = stockBefore - quantity;

         const [createMovment] = await StockMovement.create(
           [{ owner: userId,
            product: productId,
            action: "out",
            quantity: quantity,
            stockBefore: stockBefore,
            stockAfter: stockAfter
            }],
            {session}
            )

            if (ownSession) {
                await session.commitTransaction();
            }

            return createMovment;
            
        }catch(err){
             if (ownSession && session.inTransaction()) {
            await session.abortTransaction();
            }

            throw err;
        }finally{
               if (ownSession) {
                await session.endSession();
                }   
        }
    
        }

        const stockAlert = async(userId)=>{

            const findLowStockProduct = await Product.find({
                owner: userId,
                stock: { $gt: 0 },
                $expr:{
                $lte: ["$stock", "$lowStockThreshold"]
                }
            })
            
            return findLowStockProduct ;
        }

         const OutStock= async( userId)=>{

            const findOutStockProduct = await Product.find({
                owner: userId,
                stock: 0
            })
            
            return findOutStockProduct ;
        }
    module.exports = {
        StockIn,
        StockOut,
        stockAlert,
        OutStock
    }