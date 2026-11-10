
const mongoose = require("mongoose");

const setDB = async (DB_URI) => {
    await mongoose.connect(DB_URI);
};

module.exports = setDB;
