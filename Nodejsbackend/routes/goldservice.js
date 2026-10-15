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
    folder: "gold_services", // Saved in a dedicated 'gold_services' folder on Cloudinary
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
  return `gold_services/${filename}`;
};

// ==========================================
// API ENDPOINTS
// ==========================================

/**
 * @route   POST /gold-services/add
 * @desc    Create a new gold service with an image
 */
router.post("/add", upload.single("service_image"), async (req, res) => {
  const { service_id, service_name, service_fee, original_price } = req.body;

  if (!service_id || !service_name || !service_fee || !original_price) {
    return res.status(400).json({ error: "All text fields (service_id, service_name, service_fee, original_price) are required" });
  }

  if (!req.file) {
    return res.status(400).json({ error: "Service image file is required" });
  }

  try {
    const imageUrl = req.file.path; // Cloudinary secure link string

    const result = await pool.query(
      `INSERT INTO gold_services (service_id, service_name, service_fee, original_price, service_image) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING *`,
      [service_id, service_name, service_fee, original_price, imageUrl]
    );

    res.status(201).json({
      message: "Gold service created successfully",
      data: result.rows[0]
    });
  } catch (err) {
    console.error("Error inserting gold service:", err.message);
    res.status(500).json({ error: "Failed to add gold service" });
  }
});

/**
 * @route   GET /gold-services/all
 * @desc    Get all gold services
 */
router.get("/all", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM gold_services ORDER BY id DESC");
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error fetching gold services:", err.message);
    res.status(500).json({ error: "Failed to fetch gold services" });
  }
});

/**
 * @route   GET /gold-services/:id
 * @desc    Get a specific gold service by its database ID
 */
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query("SELECT * FROM gold_services WHERE id = $1", [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Gold service not found" });
    }
    
    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching gold service:", err.message);
    res.status(500).json({ error: "Failed to fetch gold service" });
  }
});

/**
 * @route   PUT /gold-services/update/:updateid
 * @desc    Update a gold service's details and/or image by ID
 */
router.put("/update/:updateid", upload.single("service_image"), async (req, res) => {
  const { updateid } = req.params;
  const { service_id, service_name, service_fee, original_price } = req.body;

  try {
    // 1. Verify if the service entry exists
    const checkResult = await pool.query("SELECT * FROM gold_services WHERE id = $1", [updateid]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: "Gold service not found" });
    }

    const currentService = checkResult.rows[0];
    
    // Retain old values if new ones are not provided in the request
    let finalServiceId = service_id || currentService.service_id;
    let finalServiceName = service_name || currentService.service_name;
    let finalServiceFee = service_fee || currentService.service_fee;
    let finalOriginalPrice = original_price || currentService.original_price;
    let finalImageUrl = currentService.service_image;

    // 2. If a brand new file is provided, update asset path and wipe the older one from Cloudinary
    if (req.file) {
      finalImageUrl = req.file.path;

      try {
        const oldPublicId = getPublicIdFromUrl(currentService.service_image);
        await cloudinary.uploader.destroy(oldPublicId);
      } catch (cloudinaryErr) {
        console.error("Failed to delete old image from Cloudinary:", cloudinaryErr.message);
      }
    }

    // 3. Update the database table
    const updateResult = await pool.query(
      `UPDATE gold_services 
       SET service_id = $1, service_name = $2, service_fee = $3, original_price = $4, service_image = $5 
       WHERE id = $6 
       RETURNING *`,
      [finalServiceId, finalServiceName, finalServiceFee, finalOriginalPrice, finalImageUrl, updateid]
    );

    res.status(200).json({
      message: "Gold service updated successfully",
      data: updateResult.rows[0]
    });
  } catch (err) {
    console.error("Error updating gold service:", err.message);
    res.status(500).json({ error: "Failed to update gold service" });
  }
});

/**
 * @route   DELETE /gold-services/:id
 * @desc    Delete gold service asset from Cloudinary and row entry from PostgreSQL
 */
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // 1. Retrieve entry details for asset address
    const checkResult = await pool.query("SELECT service_image FROM gold_services WHERE id = $1", [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: "Gold service not found" });
    }

    const imageUrl = checkResult.rows[0].service_image;

    // 2. Delete file directly from Cloudinary bucket
    try {
      const publicId = getPublicIdFromUrl(imageUrl);
      await cloudinary.uploader.destroy(publicId);
    } catch (cloudinaryErr) {
      console.error("Cloudinary asset deletion bypassed/failed:", cloudinaryErr.message);
    }

    // 3. Clear database table entry
    await pool.query("DELETE FROM gold_services WHERE id = $1", [id]);

    res.status(200).json({ message: "Gold service deleted successfully" });
  } catch (err) {
    console.error("Error deleting gold service:", err.message);
    res.status(500).json({ error: "Failed to delete gold service" });
  }
});

module.exports = router;
