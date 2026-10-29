const jwt = require('jsonwebtoken')
const AppError = require('../utils/AppError')


     function AuthMiddleware (req, res, next){
        const GEToken = req.headers.authorization

        if(!GEToken){
            throw new AppError("verife your access", 401)
        }

        try{
            const [Schema, token] = GEToken.split(" ")

            if(Schema !== "Bearer" || !token) {throw new AppError("invalid token", 403);}

            const decode = jwt.verify(token, process.env.SECRET_JWT)

            req.user = decode

            next()
        }
        catch(err){
            next(err)
        }
    }


    module.exports = AuthMiddleware