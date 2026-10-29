const { Schema, model } = require('mongoose')


    const AuthSchema = new Schema({
        name: {
            type: String,
            minlength: 2
        },
        email: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },
        password: {
            type: String,
            required: true,
            trim: true
        }
    })

    const Auth  = model("AuthModel", AuthSchema);

 module.exports = Auth;   