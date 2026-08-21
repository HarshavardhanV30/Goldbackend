// index.js
require('dotenv').config(); // Load env vars

const express = require("express");
const cors = require("cors");
const app = express();

const productRoutes = require("./routes/product");
const userRoutes = require("./routes/users");
const sellGoldRoutes = require("./routes/seller");
const ordersRoutes = require("./routes/orders");
const goldloanRoutes = require("./routes/goldloan");
const CancelorderRoutes = require("./routes/cancelorder");
const bannerRoutes = require("./routes/banners");
const numberadding = require("./routes/AddNumber");
const otpverification = require("./routes/otpverification");
const GoldPrice = require("./routes/Goldprices");
const SellPrice = require("./routes/SellGoldPrice");
const categoryname = require("./routes/category");

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads")); // serve images

app.use("/products", productRoutes);
app.use("/users", userRoutes); 
app.use("/seller", sellGoldRoutes); 
app.use("/order", ordersRoutes);
app.use("/loan", goldloanRoutes); 
app.use("/cancelorder", CancelorderRoutes); 
app.use("/otpverify", otpverification); 
app.use("/banners", bannerRoutes);
app.use("/numbers", numberadding);
app.use("/Goldprices", GoldPrice);
app.use("/sellprice", SellPrice);
app.use("/category", categoryname);

// Root route so Railway health check can verify the app is alive
app.get("/", (req, res) => {
  res.status(200).json({ status: "success", message: "API is running!" });
});

// Use Railway's provided PORT or default to 3000 (Avoid 5432 because it conflicts with PostgreSQL)
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
