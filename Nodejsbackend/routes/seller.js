const express = require("express");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../cloudinary");
const pool = require("../db");

const router = express.Router();

// Multer Storage Setup
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "seller",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
    public_id: (req, file) => Date.now() + "-" + file.originalname,
  },
});

const upload = multer({ storage });

// Helper to extract Cloudinary public ID from URL
const getPublicIdFromUrl = (url) => {
  if (!url) return null;
  const parts = url.split("/");
  const filename = parts[parts.length - 1].split(".")[0];
  return `seller/${filename}`;
};

// Helper to format JS arrays into Postgres text array format: '{item1,item2}' or '{}'
const toSqlArray = (arr) => {
  if (!arr || arr.length === 0) return "{}";
  // Escape quotes if needed and wrap in curly braces
  const escaped = arr.map(item => `"${item.replace(/"/g, '\\"')}"`);
  return `{${escaped.join(",")}}`;
};

// 1. ADD SELLER GOLD (POST)
router.post("/add", upload.array("images", 10), async (req, res) => {
  const {
    name,
    category,
    weight,
    purity,
    condition,
    price,
    description,
    full_name,
    mobilenumber,
    addharnumber,
    typeofselling,
    street_no,
    landmark,
    state,
    district,
    mandal,
    pincode,
  } = req.body;

  const files = req.files || [];
  const imagePaths = files.map((file) => file.path);
  const sqlImages = toSqlArray(imagePaths);

  try {
    const result = await pool.query(
      `INSERT INTO sellergold (
        name, category, weight, purity, condition, price, description, 
        images, full_name, mobilenumber, addharnumber, typeofselling, 
        street_no, landmark, state, district, mandal, pincode, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::text[], $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW())
      RETURNING *`,
      [
        name || null,
        category || null,
        weight ? parseFloat(weight) : null,
        purity || null,
        condition || null,
        price ? parseFloat(price) : null,
        description || null,
        sqlImages,
        full_name || null,
        mobilenumber || null,
        addharnumber || null,
        typeofselling || null,
        street_no || null,
        landmark || null,
        state || null,
        district || null,
        mandal || null,
        pincode || null,
      ]
    );

    const responseData = {
      ...result.rows[0],
      images: result.rows[0].images || [],
    };

    res.status(201).json({
      message: "Seller gold product added successfully and is awaiting approval",
      data: responseData,
    });
  } catch (err) {
    console.error("Error inserting seller gold product:", err.message);
    res.status(500).json({ error: "Failed to add seller gold product: " + err.message });
  }
});

// 2. UPDATE PRODUCT STATUS (PATCH)
router.patch("/:id/status", async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const allowedStatuses = ["pending", "approved", "rejected"];
  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      error: "Invalid status condition. Use 'pending', 'approved', or 'rejected'.",
    });
  }

  try {
    const result = await pool.query(
      "UPDATE sellergold SET status = $1 WHERE id = $2 RETURNING *",
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Seller gold product not found" });
    }

    const responseData = {
      ...result.rows[0],
      images: result.rows[0].images || [],
    };

    res.status(200).json({
      message: `Product status updated to '${status}' successfully`,
      data: responseData,
    });
  } catch (err) {
    console.error("Error updating seller gold status:", err.message);
    res.status(500).json({ error: "Failed to update product status" });
  }
});

// 3. GET ALL SELLER GOLD PRODUCTS (GET)
router.get("/all", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM sellergold ORDER BY id DESC");
    
    const formattedRows = result.rows.map(row => ({
      ...row,
      images: row.images || [],
    }));

    res.status(200).json(formattedRows);
  } catch (err) {
    console.error("Error fetching seller gold products:", err.message);
    res.status(500).json({ error: "Failed to fetch seller gold products" });
  }
});

// 4. GET SELLER GOLD PRODUCT BY ID (GET)
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query("SELECT * FROM sellergold WHERE id = $1", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Seller gold product not found" });
    }

    const responseData = {
      ...result.rows[0],
      images: result.rows[0].images || [],
    };

    res.status(200).json(responseData);
  } catch (err) {
    console.error("Error fetching seller gold product:", err.message);
    res.status(500).json({ error: "Failed to fetch seller gold product" });
  }
});

// 5. UPDATE SELLER GOLD PRODUCT DETAILS (PUT)
router.put("/:id", upload.array("images", 10), async (req, res) => {
  const { id } = req.params;
  const {
    name,
    category,
    weight,
    purity,
    condition,
    price,
    description,
    full_name,
    mobilenumber,
    addharnumber,
    typeofselling,
    status,
    street_no,
    landmark,
    state,
    district,
    mandal,
    pincode,
  } = req.body;

  try {
    const currentProductResult = await pool.query(
      "SELECT images, status FROM sellergold WHERE id = $1",
      [id]
    );

    if (currentProductResult.rows.length === 0) {
      return res.status(404).json({ error: "Seller gold product not found" });
    }

    const currentImages = currentProductResult.rows[0].images || [];
    const currentStatus = currentProductResult.rows[0].status;

    let finalImages = currentImages;

    if (req.files && req.files.length > 0) {
      await Promise.all(
        currentImages.map((url) => {
          const publicId = getPublicIdFromUrl(url);
          if (publicId) return cloudinary.uploader.destroy(publicId);
        })
      );
      finalImages = req.files.map((file) => file.path);
    }

    const sqlImages = toSqlArray(finalImages);
    const updatedStatus = status || currentStatus;

    const result = await pool.query(
      `UPDATE sellergold 
       SET name = $1, category = $2, weight = $3, purity = $4, condition = $5, 
           price = $6, description = $7, images = $8::text[], full_name = $9, 
           mobilenumber = $10, addharnumber = $11, typeofselling = $12, status = $13,
           street_no = $14, landmark = $15, state = $16, district = $17, 
           mandal = $18, pincode = $19
       WHERE id = $20
       RETURNING *`,
      [
        name || null,
        category || null,
        weight ? parseFloat(weight) : null,
        purity || null,
        condition || null,
        price ? parseFloat(price) : null,
        description || null,
        sqlImages,
        full_name || null,
        mobilenumber || null,
        addharnumber || null,
        typeofselling || null,
        updatedStatus,
        street_no || null,
        landmark || null,
        state || null,
        district || null,
        mandal || null,
        pincode || null,
        id,
      ]
    );

    const responseData = {
      ...result.rows[0],
      images: result.rows[0].images || [],
    };

    res.status(200).json({
      message: "Seller gold product updated successfully",
      data: responseData,
    });
  } catch (err) {
    console.error("Error updating seller gold product:", err.message);
    res.status(500).json({ error: "Failed to update seller gold product: " + err.message });
  }
});

// 6. DELETE SELLER GOLD PRODUCT (DELETE)
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query("SELECT images FROM sellergold WHERE id = $1", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Product not found" });
    }

    const imagePaths = result.rows[0].images || [];

    await Promise.all(
      imagePaths.map((url) => {
        const publicId = getPublicIdFromUrl(url);
        if (publicId) return cloudinary.uploader.destroy(publicId);
      })
    );

    await pool.query("DELETE FROM sellergold WHERE id = $1", [id]);

    res.status(200).json({ message: "Seller gold product deleted successfully" });
  } catch (err) {
    console.error("Error deleting seller gold product:", err.message);
    res.status(500).json({ error: "Failed to delete seller gold product" });
  }
});

module.exports = router;
