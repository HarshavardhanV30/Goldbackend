require('dotenv').config();

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
const goldrepair = require("./routes/goldrepair");

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // <-- ADD THIS LINE

app.use("/uploads", express.static("uploads"));
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
app.use("/goldrepair", goldrepair);

// Catch-all route to debug unmatched paths
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

const PORT = process.env.PORT || 5432;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
