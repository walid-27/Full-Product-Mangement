const inventory = require("../Services/Inventory.Service")

    const StockIn = async(req, res, next)=>{
        
        try{
            const stock = await inventory.StockIn(req.body, req.params.id, req.user.userId)
            res.status(201).json({
                new_Quantity: stock
            })
        }catch(err){
            next(err)
        }
    }

    module.exports = {
        StockIn
    }