const express = require("express");

const GlobalMiddleware = require("./src/middleware/GlobalMiddleware");
const AuthRoute = require("./src/routes/Auth.Route");
const ProductRoute = require("./src/routes/Product.Route");
const inventroy = require("./src/routes/Inventory.route");
const Orders = require("./src/routes/Orders.route");

const app = express();

app.use(express.json());

app.use("/auth", AuthRoute);
app.use("/api/product", ProductRoute);
app.use("/api/quantity", inventroy)
app.use("/api/order", Orders)
app.use(GlobalMiddleware);

module.exports = app;