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
    folder: "banners", // Saved in a dedicated 'banners' folder on Cloudinary
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
  return `banners/${filename}`;
};

// ==========================================
// API ENDPOINTS
// ==========================================

/**
 * @route   POST /banners/add
 * @desc    Create a new banner with a single image
 */
router.post("/add", upload.single("bannerimage"), async (req, res) => {
  const { name } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Name field is required" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "Banner image file is required" });
  }

  try {
    const imageUrl = req.file.path; // Cloudinary secure link string

    const result = await pool.query(
      `INSERT INTO banners (name, bannerimage) 
       VALUES ($1, $2) 
       RETURNING *`,
      [name, imageUrl]
    );

    res.status(201).json({
      message: "Banner created successfully",
      data: result.rows[0]
    });
  } catch (err) {
    console.error("Error inserting banner:", err.message);
    res.status(500).json({ error: "Failed to add banner" });
  }
});

/**
 * @route   GET /banners/bannerall
 * @desc    Get all banners
 */
router.get("/bannerall", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM banners ORDER BY id DESC");
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error fetching banners:", err.message);
    res.status(500).json({ error: "Failed to fetch banners" });
  }
});

/**
 * @route   PUT /banners/update/:updateid
 * @desc    Update a banner's name and/or image by ID
 */
router.put("/update/:updateid", upload.single("bannerimage"), async (req, res) => {
  const { updateid } = req.params;
  const { name } = req.body;

  try {
    // 1. Verify if the banner entry exists
    const checkResult = await pool.query("SELECT * FROM banners WHERE id = $1", [updateid]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: "Banner not found" });
    }

    const currentBanner = checkResult.rows[0];
    let finalName = name || currentBanner.name;
    let finalImageUrl = currentBanner.bannerimage;

    // 2. If a brand new file is provided, update asset path and wipe the older one from Cloudinary
    if (req.file) {
      finalImageUrl = req.file.path;

      try {
        const oldPublicId = getPublicIdFromUrl(currentBanner.bannerimage);
        await cloudinary.uploader.destroy(oldPublicId);
      } catch (cloudinaryErr) {
        console.error("Failed to delete old image from Cloudinary:", cloudinaryErr.message);
      }
    }

    // 3. Update the database table
    const updateResult = await pool.query(
      `UPDATE banners 
       SET name = $1, bannerimage = $2 
       WHERE id = $3 
       RETURNING *`,
      [finalName, finalImageUrl, updateid]
    );

    res.status(200).json({
      message: "Banner updated successfully",
      data: updateResult.rows[0]
    });
  } catch (err) {
    console.error("Error updating banner:", err.message);
    res.status(500).json({ error: "Failed to update banner" });
  }
});

/**
 * @route   DELETE /banners/:id
 * @desc    Delete banner asset from Cloudinary and row entry from PostgreSQL
 */
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Retrieve entry details for asset address
    const checkResult = await pool.query("SELECT bannerimage FROM banners WHERE id = $1", [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: "Banner not found" });
    }

    const imageUrl = checkResult.rows[0].bannerimage;

    // 2. Delete file directly from Cloudinary bucket
    try {
      const publicId = getPublicIdFromUrl(imageUrl);
      await cloudinary.uploader.destroy(publicId);
    } catch (cloudinaryErr) {
      console.error("Cloudinary asset deletion bypassed/failed:", cloudinaryErr.message);
    }

    // 3. Clear database table entry
    await pool.query("DELETE FROM banners WHERE id = $1", [id]);

    res.status(200).json({ message: "Banner deleted successfully" });
  } catch (err) {
    console.error("Error deleting banner:", err.message);
    res.status(500).json({ error: "Failed to delete banner" });
  }
});

module.exports = router;
