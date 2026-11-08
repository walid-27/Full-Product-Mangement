const  mongoose  = require("mongoose")
const Product = require("../models/Product")
const Order = require("../models/Order") 

    const AnalysisProduct = async(userId, Datequery)=>{
        
        const resualts = await Product.aggregate([
            {
                $match: {
                    owner: new mongoose.Types.ObjectId(userId),
                    ...(Datequery && {
                        createdAt: {
                            $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                        }
                    })
                }
            },
            {
                $group: {
                    _id: null,
                    owner: { $first: "$owner"},
                    totalProduct: { $sum : 1},
                    totalStock: { $sum : "$stock"},
                    totalPrices: { $sum : { $multiply: ["$price", "$stock"]}},
                    outOfStock: {
                    $sum: {
                        $cond: [
                          { $eq: ["$stock", 0] },
                            1,0
                             ]
                    }}
                    
                }
            },
            {
            $project: {
                _id: 0,
                totalProduct: 1,
                totalStock: 1,
                totalPrices: 1,
                outOfStock: 1
            }
            }
        ])

        if (resualts.length === 0) {
        return {
            totalProduct: 0,
            totalStock: 0,
            totalPrices: 0,
            outOfStock: 0
        };
        }
 
        return resualts[0]; 
    }


    const AnalysisOrder = async(userId, Datequery)=>{

        const resualts = await Order.aggregate([
            {
                $match: {
                    owner: new mongoose.Types.ObjectId(userId),
                     ...(Datequery && {
                        createdAt: {
                            $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
                        }
                    })
                }
            },
            {
                $group: {
                    _id: null,

                    totalOrder: { $sum: 1 },

                    pendingOrder: {
                    $sum: {
                        $cond: [{ $eq: ["$status", "pending"] }, 1, 0]
                    }
                    },

                    confirmedOrder: {
                    $sum: {
                        $cond: [{ $eq: ["$status", "confirmed"] }, 1, 0]
                    }
                    },

                    shippedOrder: {
                    $sum: {
                        $cond: [{ $eq: ["$status", "shipped"] }, 1, 0]
                    }
                    },

                    deliveredOrder: {
                    $sum: {
                        $cond: [{ $eq: ["$status", "delivered"] }, 1, 0]
                    }
                    },

                    cancelledOrder: {
                    $sum: {
                        $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0]
                    }
                    },
                    totalRevenue: {
                    $sum: {
                        $cond: [
                        { $eq: ["$status", "delivered"] },
                        "$totalPrice",
                        0
                        ]
                    }
                    }
                }
                },
                {
                $project: {
                    _id: 0
                }
                }
            

        ])

         if(resualts.length === 0){ 
        return { 
        totalOrder: 0, 
        pendingOrder: 0, 
        canceledOrder: 0, 
        shippedOrder: 0 ,
        deliveredOrder: 0,
        cancelledOrder: 0,
        totalRevenue: 0
        }; 
        } 
 
        return resualts[0]; 

    }


    module.exports = {
        AnalysisProduct,
        AnalysisOrder
    }