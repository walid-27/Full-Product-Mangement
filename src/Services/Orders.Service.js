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
               

        return createOrder;
        }finally {
            await session.endSession();
        } 
                
    
        

        
    }

    const getAllOrder = async(userId, querySearch, queryStatus, queryPage, queryLimit, querySort)=>{

        const presdPage = Number(queryPage ?? 1)
        const presdLimit = Number(queryLimit ?? 12 )


        if(!Number.isInteger(presdPage) || presdPage < 1) throw new AppError("the page number should be positive", 400);
        if(!Number.isInteger(presdLimit) || presdLimit < 1 || presdLimit > 100) throw new AppError("the page number should be positive", 400);

            const page = presdPage;
            const limit = presdLimit;
            const skip = (page - 1) * limit

        const filter = {
            owner: userId
        }

        if (querySearch) {
        const safeSearch = querySearch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        filter.$or = [
            { "userInfo.name": { $regex: safeSearch, $options: "i" } },
            { "userInfo.city": { $regex: safeSearch, $options: "i" } }
        ];
        }

        if(queryStatus){
            filter.status = queryStatus
                
        }
            const allowedSortFields = ["totalPrice", "createdAt"];  

            const sortField = allowedSortFields.includes(querySort)
            ? querySort
            : "createdAt";
    
        const geTOrders = await Order.find(filter)
                                        .sort({[sortField]: -1})
                                        .skip(skip)
                                        .limit(limit)

        if(geTOrders.length == 0) throw new AppError(`find ${geTOrders.length} order`, 404)
            
        const total = await Order.countDocuments(filter);
        const totalPages = Math.ceil(total / limit);    
        return {
            orders: geTOrders,
            pagnition: {
                page,
                limit,
                total,
                totalPages
            }
        }
    }


    const getOrderById = async(userId, orderId)=>{

        if (!mongoose.isValidObjectId(orderId)) {throw new AppError("Invalid order ID", 400);}

        const findOrder = await Order.findOne({
            _id: orderId,
            owner: userId
        })

        if(!findOrder) throw new AppError("Order not Founded", 404);

        return findOrder

    }

    const updateOrderStatus = async(orderId, userId, data)=>{
        const {status} = data
         const allowedStatuses = [
            "pending",
            "confirmed",
            "shipped",
            "delivered",
            "cancelled"
        ];

        if (!allowedStatuses.includes(status)) {
            throw new AppError("Invalid order status", 400);
        }

        const findOrderAndUpdateStatus = await Order.findOneAndUpdate(
            {
                _id: orderId,
                owner: userId
            },
            {
                $set: {status}
            },
            {
                new: true,
                runValidators: true
            }
        )

        if(!findOrder) throw new AppError("Order Not Found", 400);

        return {
            message: "the status has been updated",
            findOrderAndUpdateStatus}
    }

    const CancelOrder = async(orderId, ownerId)=>{
        const findOrder = await Order.findOne({
                    _id: orderId,
                    owner: ownerId
                })
        if(!findOrder) throw new AppError("Order Not Found", 400);
                if (findOrder.status === "cancelled") {
                throw new AppError("Order is already cancelled", 400);
                }
                if (["shipped", "delivered"].includes(findOrder.status)) {
                throw new AppError(
                    "Cannot cancel an order that has already shipped",
                    400
                );
                }
                  if (!["pending", "confirmed"].includes(findOrder.status)) {
                     throw new AppError("Order cannot be cancelled", 400);
                    }

        

        const session = await mongoose.startSession();
        try{
            const CancelOrder = await session.withTransaction(async ()=>{

                  for (const item of findOrder.products) {
                        await inventroy.StockIn(
                        { quantity: item.quantity },
                        item.product,
                        ownerId,
                        session
                        );
                    }
                

             const findOrderAndCancel = await Order.findOneAndUpdate(
                {
                    _id: orderId,
                    owner: ownerId
                },
                {
                    $set: {status: "cancelled"}
                },
                {
                    new: true,
                    runValidators: true,
                    session
                }
            )

              if (!findOrderAndCancel) {
                throw new AppError(
                    "Order status changed; please retry",
                    409
                    );
                }

            return findOrderAndCancel
            })
            
            return {
            message: "the order has been cancelled",
            CancelOrder}

        }finally{
            await session.endSession();
            
        
        }

    }
    
    module.exports = {
        createOrder ,
        getAllOrder ,
        getOrderById,
        updateOrderStatus,
        CancelOrder

    }