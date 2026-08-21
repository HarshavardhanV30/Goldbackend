const express = require("express");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../cloudinary");
const pool = require("../db");

const router = express.Router();

// Test Route
router.get("/", (req, res) => {
  res.send("Product route working");
});

// Cloudinary Storage Configuration
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "products",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
  },
});

const upload = multer({ storage });

/* ==================================
   ADD PRODUCT
================================== */
router.post("/add", upload.array("product_images", 10), async (req, res) => {
  const {
    product_id,
    product_name,
    category_name,
    weight,
    offer_price,
    original_price,
    stock_quantity,
    product_place,
    product_description,
    state,
    district,
    purity,
    mandal,
    pincode,
  } = req.body;

  try {
    const imageUrls = req.files && req.files.length > 0
      ? req.files.map((file) => file.path)
      : [];

    const result = await pool.query(
      `INSERT INTO products (
          product_id,
          product_name,
          category_name,
          weight,
          offer_price,
          original_price,
          stock_quantity,
          product_place,
          product_description,
          product_images,
          state,
          district,
          purity,
          mandal,
          pincode,
          created_at
       )
       VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW()
       )
       RETURNING *`,
      [
        product_id,
        product_name,
        category_name,
        weight ? parseFloat(weight) : 0,
        offer_price ? parseFloat(offer_price) : 0,
        original_price ? parseFloat(original_price) : 0,
        stock_quantity ? parseInt(stock_quantity, 10) : 0,
        product_place,
        product_description,
        imageUrls, 
        state,
        district,
        purity, 
        mandal, 
        pincode,
      ]
    );

    res.status(201).json({
      success: true,
      message: "Product added successfully",
      product: result.rows[0],
    });
  } catch (err) {
    console.error("Error adding product:", err.message);
    res.status(500).json({
      success: false,
      error: "Failed to add product",
      details: err.message, // Helpful for debugging on Railway logs
    });
  }
});

/* ==================================
   GET ALL PRODUCTS (Endpoint: /products/all)
================================== */
router.get("/all", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM products ORDER BY created_at DESC"
    );
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error fetching products:", err.message);
    res.status(500).json({
      error: "Failed to fetch products",
      details: err.message,
    });
  }
});

/* ==================================
   GET PRODUCT BY ID
================================== */
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  
  try {
    let result;

    if (/^\d+$/.test(id)) {
      result = await pool.query(
        "SELECT * FROM products WHERE id = $1 OR product_id = $2",
        [parseInt(id, 10), id]
      );
    } else {
      result = await pool.query(
        "SELECT * FROM products WHERE product_id = $1",
        [id]
      );
    }

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: "Product not found",
      });
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching product:", err.message);
    res.status(500).json({
      error: "Failed to fetch product",
    });
  }
});

/* ==================================
   DELETE PRODUCT
================================== */
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  const getPublicIdFromUrl = (url) => {
    const parts = url.split("/");
    const filenameWithExtension = parts[parts.length - 1];
    const filename = filenameWithExtension.split(".")[0];
    return `products/${filename}`;
  };

  try {
    let result;

    if (/^\d+$/.test(id)) {
      result = await pool.query(
        "SELECT * FROM products WHERE id = $1 OR product_id = $2",
        [parseInt(id, 10), id]
      );
    } else {
      result = await pool.query(
        "SELECT * FROM products WHERE product_id = $1",
        [id]
      );
    }

    if (result.rowCount === 0) {
      return res.status(404).json({
        error: "Product not found",
      });
    }

    const product = result.rows[0];
    const images = product.product_images || [];

    await Promise.all(
      images.map((url) => {
        const publicId = getPublicIdFromUrl(url);
        return cloudinary.uploader.destroy(publicId);
      })
    );

    if (/^\d+$/.test(id)) {
      await pool.query(
        "DELETE FROM products WHERE id = $1 OR product_id = $2",
        [parseInt(id, 10), id]
      );
    } else {
      await pool.query(
        "DELETE FROM products WHERE product_id = $1",
        [id]
      );
    }

    res.status(200).json({
      message: "Product deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting product:", err.message);
    res.status(500).json({
      error: "Failed to delete product",
    });
  }
});

module.exports = router;
