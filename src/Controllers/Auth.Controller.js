const AppError = require("../utils/AppError")
const AuthServices = require('../Services/Auth.Service')



    const register = async (req, res, next)=>{
        try{
            const Register = await AuthServices.register(req.body);

            return res.status(201).json({
                message: "the user has been successfull register",
                register: Register
            });


        }catch(err){
            
            return next(err);

            }
        };

        const login = async (req, res, next)=>{
        try{
            const login = await AuthServices.login(req.body);

            return res.status(200).json({
                message: "the user has been successfull login",
                register: login
            });


        }catch(err){
            
            return next(err);

        }
    };




 
    module.exports = {
    register,
    login
 }   