const mongoose = require("mongoose");

const AuthSchema = new mongoose.Schema({
    name: { type: String, required: true, minlength: 2, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    password: { type: String, required: true },
    emailVerifiedAt: { type: Date, required: false },
    failedLoginAttempts: { type: Number, default: 0, min: 0 },
    lockUntil: { type: Date, default: null },
    passwordChangedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model("AuthModel", AuthSchema);
