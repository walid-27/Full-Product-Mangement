
require("dotenv").config();

const app = require("./app");
const setDB = require("./src/utils/setDB");

const startServer = async () => {
    try {
        await setDB(process.env.MONGO_URL);

        const PORT = process.env.PORT || 5000;

        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT}`);
        });
    } catch (err) {
        console.error("Server startup failed:", err.message);
        process.exitCode = 1;
    }
};

startServer();
