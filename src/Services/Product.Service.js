const Product = require('../models/Product')
const AppError = require('../utils/AppError')
const mongoose = require('mongoose');
const path = require('path');
const fs= require('fs')
const fsPromises = require("fs/promises");


    const createProduct = async (data, file, userId)=>{

        const {name, price, category} = data

        if(!file) throw new AppError("check your form ", 400);
            
        

        const findExsitProduct = await Product.findOne({
            name: name,
            owner: userId
        
        })

        if(findExsitProduct) throw new AppError("exsit product ", 400);
            
        const createProduct = await Product.create({
            name: name,
            price: price,
            category: category,
            owner: userId,
            image: file.filename
        })
        
        return {
            message: "the product has been successfully created", 
            Product: createProduct
        }
    }


    const getProduct = async(userId, querySearch, queryCategory, queryPage, queryLimit, querySort)=>{
        //search, filtering, pagnition, sorting
           const parsedPage = Number(queryPage ?? 1);
            const parsedLimit = Number(queryLimit ?? 12);

            if (
                !Number.isInteger(parsedPage) ||
                parsedPage < 1
            ) {
                throw new AppError("Page must be a positive integer", 400);
            }

            if (
                !Number.isInteger(parsedLimit) ||
                parsedLimit < 1 ||  
                parsedLimit > 100
            ) {
                throw new AppError("Limit must be between 1 and 100", 400);
            }

            const page = parsedPage;
            const limit = parsedLimit;
            const skip = (page - 1) * limit;
        const filter = {
            owner: userId
        }
        
        if(querySearch){
            filter.name = {
                $regex: querySearch,
                $options: "i"
            }
        }
        if(queryCategory){
             filter.category = {
                $regex: queryCategory,
                $options: "i"
            }
        }

        const allowedSortFields = ["name", "price", "createdAt"];

            const sortField = allowedSortFields.includes(querySort)
            ? querySort
            : "createdAt";

        const findProducts = await Product.find(filter)
                                .sort({[sortField]: -1})
                                .skip(skip)
                                .limit(limit)


        const total = await Product.countDocuments(filter);
        const totalPages = Math.ceil(total / limit)
        
        return{
            products:  findProducts,
            pagnition: {
                page,
                limit,
                total,
                totalPages
            }
        }
    }


    const updateProduct = async(data,file, paramsid, userId)=>{
        
        const findPrdct = await Product.findOne({
                _id: paramsid,
                owner: userId
            });

        if(!findPrdct) throw new AppError("Any Product find it with this ID", 404);
            
            const imageBeforeUpdate = findPrdct.image
            
            if (file) findPrdct.image = file.filename

        const {name, price, category} = data
        if (name !== undefined) findPrdct.name = name;
        if (price !== undefined) findPrdct.price = price;
        if (category !== undefined) findPrdct.category = category;
        await findPrdct.save();
            if(file &&
            imageBeforeUpdate &&
            imageBeforeUpdate !== file.filename){
                const imagePath = path.join(
                                         __dirname,
                                         "../..",
                                         "uploads" ,
                                         imageBeforeUpdate
                                     )
                 
                                     fs.unlink(imagePath, (err)=>{
                                         if(err){
                                             console.log("image deleted field", err.message)
                                         }
                                     })
            }
        return {
            message: "the prdouct was successfully updated",
            product: findPrdct
        }


    }


    const deleteProduct = async (productId, userId) => {
    const findPrdct = await Product.findOne({
        _id: productId,
        owner: userId
    });

    if (!findPrdct) {
        throw new AppError("The product is not found", 404);
    }

    // 1. Delete product from MongoDB
    await Product.deleteOne({
        _id: productId,
        owner: userId
    });

                  if(findPrdct.image){
                                     const imagePath = path.join(
                                         __dirname,
                                         "../..",
                                         "uploads" ,
                                         findPrdct.image
                                     )
                 
                                     fs.unlink(imagePath, (err)=>{
                                         if(err){
                                             console.log("image deleted field", err.message)
                                         }
                                     })
                                  }
                 

        return {
            message: "the product is deleted"
        }
    }


    //Analysis Products
    const analysisProducts = async (userId) => {
        const resualts = await Product.aggregate([
            {
                $match: {
                    owner:new mongoose.Types.ObjectId(userId)
                }
            },
            {
                $group: {
                    _id: null,
                    owner: { $first: "$owner" },
                    totalProducts: { $sum: 1 },
                    totalStock: { $sum: "$stock" },
                    // totalPrice: { $sum: "$price" },
                    // averagePrice: { $avg: "$price" },
                    totalstockValue: { $sum: { $multiply: ["$price", "$stock"] } },
                    
                }
            },
            // {
            //     $lookup: {
            //         from: "authmodels", // The name of the Auth collection
            //         localField: "owner",
            //         foreignField: "_id",
            //         as: "userDetails" 
            //     }
            // },{
            //     $unwind: "$userDetails"
            // },{
            {
                $project: {
                    _id: 0,
                category: "$_id",
                totalProducts: 1,
                totalStock: 1,  
                // averagePrice: 1,
                totalstockValue: 1,
                userDetails: {
                    name: "$userDetails.name",
                }
            }
        },
            {
                $sort: { totalProducts: -1 } // Sort by totalProducts in descending order
            }
        ])
 
         if(resualts.length === 0){ 
        return { 
        totalProducts: 0, 
        totalStock: 0, 
        totalStockValue: 0, 
        averagePrice: 0 
    }; 
    } 
 
        return resualts[0]; 
    } 
 
 
    
 module.exports = { 
    createProduct, 
    getProduct, 
    updateProduct, 
    deleteProduct, 
    analysisProducts 
 }    