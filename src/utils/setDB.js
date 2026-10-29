
const mongoose = require("mongoose");

const setDB = async (DB_URI) => {
    await mongoose.connect(DB_URI);
    console.log("MongoDB connected successfully");
};

module.exports = setDB;
