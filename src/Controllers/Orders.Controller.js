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

    module.exports ={
        createOrder
    }