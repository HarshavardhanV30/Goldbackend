const express = require("express");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../cloudinary");
const pool = require("../db");

const router = express.Router();

// ==========================================
// CLOUDINARY STORAGE CONFIGURATION
// ==========================================
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "gold_repairs",
    allowed_formats: ["jpg", "png", "jpeg", "webp", "gif"],
    public_id: (req, file) => Date.now() + "-" + file.originalname,
  },
});

const upload = multer({ storage });

// Helper to handle Multer middleware errors cleanly
const uploadSingleImage = (req, res, next) => {
  upload.single("repairimage")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({ error: `Upload error: ${err.message}. Ensure you upload only 1 file.` });
    } else if (err) {
      return res.status(500).json({ error: `Image upload error: ${err.message}` });
    }
    next();
  });
};

const getPublicIdFromUrl = (url) => {
  if (!url) return null;
  const parts = url.split("/");
  const filename = parts[parts.length - 1].split(".")[0];
  return `gold_repairs/${filename}`;
};

// ==========================================
// API ENDPOINTS
// ==========================================

/**
 * @route   POST /goldrepair/add
 */
router.post("/add", uploadSingleImage, async (req, res) => {
  const { title, description, price } = req.body;

  if (!title) {
    return res.status(400).json({ error: "Title field is required" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "Repair image file is required" });
  }

  try {
    const imageUrl = req.file.path;
    const numericPrice = price ? parseFloat(price) : null;

    const result = await pool.query(
      `INSERT INTO gold_repairs (title, description, price, repairimage) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [title, description || null, numericPrice, imageUrl]
    );

    res.status(201).json({
      message: "Gold repair service created successfully",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("Error creating gold repair service:", err.message);
    res.status(500).json({ error: err.message || "Failed to add gold repair service" });
  }
});

module.exports = router;
