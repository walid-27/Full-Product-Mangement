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

    const StockOut = async(req, res, next)=>{
        
        try{
            const stock = await inventory.StockOut(req.body, req.params.id, req.user.userId)
            res.status(201).json({
                new_Quantity: stock
            })
        }catch(err){
            next(err)
        }
    }

    const stockAlert = async(req, res, next)=>{
        
        try{
            const stock = await inventory.stockAlert(  req.user.userId)
            res.status(201).json({
                low_Quantity: stock
            })
        }catch(err){
            next(err)
        }
    }

    const OutStock = async(req, res, next)=>{
        
        try{
            const stock = await inventory.OutStock( req.user.userId)
            res.status(201).json({
                out_Quantity: stock
            })
        }catch(err){
            next(err)
        }
    }

    module.exports = {
        StockIn,
        StockOut,
        stockAlert,
        OutStock
    }