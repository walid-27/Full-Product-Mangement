const Auth = require("../models/Auth");
const AppError = require("../utils/AppError");


const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

    const register = async (data)=>{

        const {name, email, password} = data;

        const checkExsitUser = await Auth.findOne({email: email})

        if(checkExsitUser){
            throw new AppError("this user allready exsit", 409, "USER_EXISTS");
        }

        const HashPassword = await bcrypt.hash(password, 10);

        await Auth.create({
            name: name,
            email: email,
            password: HashPassword
        });

        const response = {name, email};

        return response;

    };


    const login = async (data)=>{
        
        const {email, password} = data;

        const findUser = await Auth.findOne({email: email});

        if(!findUser){
            throw new AppError("The email or password is invalid", 401, "INVALID_CREDENTIALS")
        }

        const comparePassword = await bcrypt.compare(password, findUser.password);

        if(!comparePassword){
            throw new AppError("The email or password is invalid", 401, "INVALID_CREDENTIALS");
        }

        const token = await jwt.sign(
            {   userId: findUser._id,
                email: email
            },
            process.env.SECRET_JWT , 
            {
                expiresIn: "12h"
            }
        )

        const response = {
            name: findUser.name,
            email: email,
            token: token
        }


        return response;

    }


module.exports = {
    register, 
    login
}    