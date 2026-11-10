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
    const getOrderById = async(req, res, next)=>{
         try{
                    const orders = await Order.getOrderById(req.user.userId, req.params.id)
                    res.status(200).json({
                        Order: orders
                    })
                }catch(err){
                    next(err)
                }
    }

    const updateOrderStatus = async(req, res, next)=>{
         try{
                    const orders = await Order.updateOrderStatus(req.params.id, req.user.userId, req.body)
                    res.status(200).json(orders)
                }catch(err){
                    next(err)
                }
    }
    const CancelOrder = async(req, res, next)=>{
         try{
                    const orders = await Order.CancelOrder(req.params.id, req.user.userId)
                    res.status(200).json(orders)
                }catch(err){
                    next(err)
                }
    }

    module.exports ={
        createOrder,
        getAllOrder,
        getOrderById,
        updateOrderStatus,
        CancelOrder
    }