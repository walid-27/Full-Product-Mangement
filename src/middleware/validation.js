const AppError = require("../utils/AppError");

     function Validation(req, res, next){
            const { name, price, stock } = req.body;
            if(!name || name.trim() === ""){

                return next(new AppError("should add the name", 400))
            }

            if(price === undefined || price <= 0){

                return next(new AppError("check your Price", 400))

            }
           
            return next()
        }

module.exports = Validation

    
                