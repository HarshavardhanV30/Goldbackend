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
    folder: "categories", // Saved in a dedicated 'categories' folder on Cloudinary
    allowed_formats: ["jpg", "png", "jpeg", "webp", "gif"],
    public_id: (req, file) => Date.now() + "-" + file.originalname,
  },
});

const upload = multer({ storage });

// ==========================================
// HELPER FUNCTION FOR CLOUDINARY CLEANUP
// ==========================================
const getPublicIdFromUrl = (url) => {
  const parts = url.split("/");
  const filename = parts[parts.length - 1].split(".")[0];
  return `categories/${filename}`;
};

// ==========================================
// API ENDPOINTS
// ==========================================

/**
 * @route   POST /categories/add
 * @desc    Create a new category with a single image
 */
router.post("/add", upload.single("categoryimage"), async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Name field is required" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "Category image file is required" });
  }

  try {
    const imageUrl = req.file.path; // Cloudinary secure link string

    const result = await pool.query(
      `INSERT INTO categories (name, categoryimage) 
       VALUES ($1, $2) 
       RETURNING *`,
      [name, imageUrl]
    );

    res.status(201).json({
      message: "Category created successfully",
      data: result.rows[0]
    });
  } catch (err) {
    console.error("Error inserting category:", err.message);
    res.status(500).json({ error: "Failed to add category" });
  }
});

/**
 * @route   GET /categories/categoryall
 * @desc    Get all categories
 */
router.get("/all", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM categories ORDER BY id DESC");
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error fetching categories:", err.message);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

/**
 * @route   PUT /categories/update/:updateid
 * @desc    Update a category's name and/or image by ID
 */
router.put("/updateid", upload.single("categoryimage"), async (req, res) => {
  const { updateid } = req.params;
  const { name } = req.body;

  try {
    // 1. Verify if the category entry exists
    const checkResult = await pool.query("SELECT * FROM categories WHERE id = $1", [updateid]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    const currentCategory = checkResult.rows[0];
    let finalName = name || currentCategory.name;
    let finalImageUrl = currentCategory.categoryimage;

    // 2. If a brand new file is provided, update asset path and wipe the older one from Cloudinary
    if (req.file) {
      finalImageUrl = req.file.path;

      try {
        const oldPublicId = getPublicIdFromUrl(currentCategory.categoryimage);
        await cloudinary.uploader.destroy(oldPublicId);
      } catch (cloudinaryErr) {
        console.error("Failed to delete old image from Cloudinary:", cloudinaryErr.message);
      }
    }

    // 3. Update the database table
    const updateResult = await pool.query(
      `UPDATE categories 
       SET name = $1, categoryimage = $2 
       WHERE id = $3 
       RETURNING *`,
      [finalName, finalImageUrl, updateid]
    );

    res.status(200).json({
      message: "Category updated successfully",
      data: updateResult.rows[0]
    });
  } catch (err) {
    console.error("Error updating category:", err.message);
    res.status(500).json({ error: "Failed to update category" });
  }
});

/**
 * @route   DELETE /categories/:id
 * @desc    Delete category asset from Cloudinary and row entry from PostgreSQL
 */
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Retrieve entry details for asset address
    const checkResult = await pool.query("SELECT categoryimage FROM categories WHERE id = $1", [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    const imageUrl = checkResult.rows[0].categoryimage;

    // 2. Delete file directly from Cloudinary bucket
    try {
      const publicId = getPublicIdFromUrl(imageUrl);
      await cloudinary.uploader.destroy(publicId);
    } catch (cloudinaryErr) {
      console.error("Cloudinary asset deletion bypassed/failed:", cloudinaryErr.message);
    }

    // 3. Clear database table entry
    await pool.query("DELETE FROM categories WHERE id = $1", [id]);

    res.status(200).json({ message: "Category deleted successfully" });
  } catch (err) {
    console.error("Error deleting category:", err.message);
    res.status(500).json({ error: "Failed to delete category" });
  }
});

module.exports = router;
