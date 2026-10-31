const Order = require("../Services/Orders.Service")


    const createOrder = async(req, res, next)=>{
         try{
                    const orders = await Order.createOrder(req.body, req.user.userId)
                    res.status(201).json({
                        new_Order: orders
                    })
                }catch(err){
                    next(err)
                }
    }
    const getAllOrder = async(req, res, next)=>{
         try{
                    const orders = await Order.getAllOrder(req.user.userId, req.query.name, req.query.status, req.query.page, req.query.limit, req.query.sort)
                    res.status(200).json({
                        Orders: orders
                    })
                }catch(err){
                    next(err)
                }
    }

    module.exports ={
        createOrder,
        getAllOrder
    }