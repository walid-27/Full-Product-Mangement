const Dashboard = require("../Services/DashBorad.Service")

      const AnalysisProduct = async(req, res, next)=>{
             try{
                        const products = await Dashboard.AnalysisProduct(req.user.userId, req.query.date)
                        res.status(201).json(products)
                    }catch(err){
                        next(err)
                    }
        }
        const AnalysisOrder = async(req, res, next)=>{
             try{
                        const orders = await Dashboard.AnalysisOrder(req.user.userId, req.query.period === "30d")
                        res.status(201).json(orders)
                    }catch(err){
                        next(err)
                    }
        }


        module.exports = {
        AnalysisProduct,
        AnalysisOrder
    }