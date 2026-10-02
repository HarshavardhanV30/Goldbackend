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

// Wrapper middleware to safely capture Multer errors (e.g. uploading multiple files when single is expected)
const handleUpload = (req, res, next) => {
  upload.single("repairimage")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return res.status(400).json({
        error: `Multer upload error: ${err.message}. Please select only 1 image file for 'repairimage'.`,
      });
    } else if (err) {
      return res.status(500).json({ error: `Upload handler error: ${err.message}` });
    }
    next();
  });
};

// ==========================================
// HELPER FUNCTION FOR CLOUDINARY CLEANUP
// ==========================================
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
 * @desc    Create a new gold repair service record with a single image
 */
router.post("/add", handleUpload, async (req, res) => {
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
    res.status(500).json({ error: "Failed to add gold repair service: " + err.message });
  }
});

/**
 * @route   GET /goldrepair/repairall
 * @desc    Get all gold repair services
 */
router.get("/repairall", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM gold_repairs ORDER BY id DESC");
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Error fetching gold repair services:", err.message);
    res.status(500).json({ error: "Failed to fetch gold repair services" });
  }
});

/**
 * @route   GET /goldrepair/:id
 * @desc    Get single gold repair service by ID
 */
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query("SELECT * FROM gold_repairs WHERE id = $1", [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Gold repair service not found" });
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error("Error fetching gold repair service:", err.message);
    res.status(500).json({ error: "Failed to fetch gold repair service" });
  }
});

/**
 * @route   PUT /goldrepair/update/:updateid
 * @desc    Update a gold repair service record by ID
 */
router.put("/update/:updateid", handleUpload, async (req, res) => {
  const { updateid } = req.params;
  const { title, description, price } = req.body;

  try {
    const checkResult = await pool.query("SELECT * FROM gold_repairs WHERE id = $1", [
      updateid,
    ]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: "Gold repair service not found" });
    }

    const currentRecord = checkResult.rows[0];
    const finalTitle = title !== undefined ? title : currentRecord.title;
    const finalDescription =
      description !== undefined ? description : currentRecord.description;
    const finalPrice = price !== undefined ? parseFloat(price) : currentRecord.price;
    let finalImageUrl = currentRecord.repairimage;

    // Delete old image from Cloudinary if a new one is uploaded
    if (req.file) {
      finalImageUrl = req.file.path;
      try {
        const oldPublicId = getPublicIdFromUrl(currentRecord.repairimage);
        if (oldPublicId) {
          await cloudinary.uploader.destroy(oldPublicId);
        }
      } catch (cloudinaryErr) {
        console.error("Failed to delete old image from Cloudinary:", cloudinaryErr.message);
      }
    }

    const updateResult = await pool.query(
      `UPDATE gold_repairs 
       SET title = $1, description = $2, price = $3, repairimage = $4 
       WHERE id = $5 
       RETURNING *`,
      [finalTitle, finalDescription, finalPrice, finalImageUrl, updateid]
    );

    res.status(200).json({
      message: "Gold repair service updated successfully",
      data: updateResult.rows[0],
    });
  } catch (err) {
    console.error("Error updating gold repair service:", err.message);
    res.status(500).json({ error: "Failed to update gold repair service" });
  }
});

/**
 * @route   DELETE /goldrepair/:id
 * @desc    Delete gold repair record and delete Cloudinary image asset
 */
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const checkResult = await pool.query(
      "SELECT repairimage FROM gold_repairs WHERE id = $1",
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ error: "Gold repair service not found" });
    }

    const imageUrl = checkResult.rows[0].repairimage;

    try {
      const publicId = getPublicIdFromUrl(imageUrl);
      if (publicId) {
        await cloudinary.uploader.destroy(publicId);
      }
    } catch (cloudinaryErr) {
      console.error("Cloudinary asset deletion failed:", cloudinaryErr.message);
    }

    await pool.query("DELETE FROM gold_repairs WHERE id = $1", [id]);

    res.status(200).json({ message: "Gold repair service deleted successfully" });
  } catch (err) {
    console.error("Error deleting gold repair service:", err.message);
    res.status(500).json({ error: "Failed to delete gold repair service" });
  }
});

module.exports = router;
