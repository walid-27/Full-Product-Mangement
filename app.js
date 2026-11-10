const express = require("express");

const GlobalMiddleware = require("./src/middleware/GlobalMiddleware");
const AuthRoute = require("./src/routes/Auth.Route");
const ProductRoute = require("./src/routes/Product.Route");
const InventoryRoute = require("./src/routes/Inventory.route");
const OrdersRoute = require("./src/routes/Orders.route");
const DashboardRoute = require("./src/routes/DashBoard.route");

const app = express();

app.use(express.json());

app.use("/auth", AuthRoute);
app.use("/api/product", ProductRoute);
app.use("/api/quantity", InventoryRoute);
app.use("/api/order", OrdersRoute);
app.use("/api/dashboard", DashboardRoute);
app.use(GlobalMiddleware);

module.exports = app;
