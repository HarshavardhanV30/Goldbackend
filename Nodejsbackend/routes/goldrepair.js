const express = require("express");
const pool = require("../db");
const cloudinary = require("../cloudinary");

const router = express.Router();

/**
 * Helper function to extract Cloudinary public_id from a URL
 */
const getPublicIdFromUrl = (url) => {
  if (!url || !url.includes("cloudinary.com")) return null;
  const parts = url.split("/");
  const filename = parts[parts.length - 1].split(".")[0];
  return `gold_repairs/${filename}`;
};

// ==========================================
// API ENDPOINTS
// ==========================================

/**
 * @route   POST /goldrepair/add
 * @desc    Create a new gold repair service using JSON payload
 *          Accepts either a Cloudinary image URL or a Base64 image string
 */
router.post("/add", async (req, res) => {
  const { title, description, price, repairimage } = req.body;

  // 1. Validation
  if (!title) {
    return res.status(400).json({
      success: false,
      error: "Title field is required",
    });
  }

  if (!repairimage) {
    return res.status(400).json({
      success: false,
      error: "Repair image field (URL or Base64 string) is required",
    });
  }

  try {
    let finalImageUrl = repairimage;

    // 2. If client sends a Base64 string instead of a URL, upload directly to Cloudinary
    if (repairimage.startsWith("data:image")) {
      const uploadResponse = await cloudinary.uploader.upload(repairimage, {
        folder: "gold_repairs",
      });
      finalImageUrl = uploadResponse.secure_url;
    }

    // 3. Format price
    const numericPrice = price !== undefined && price !== null ? parseFloat(price) : null;

    // 4. Database Insert Query
    const result = await pool.query(
      `INSERT INTO gold_repairs (title, description, price, repairimage) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [title, description || null, numericPrice, finalImageUrl]
    );

    return res.status(201).json({
      success: true,
      message: "Gold repair service created successfully",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("Error creating gold repair service:", err.message);
    return res.status(500).json({
      success: false,
      error: err.message || "Failed to add gold repair service",
    });
  }
});

/**
 * @route   GET /goldrepair/repairall
 * @desc    Get all gold repair services
 */
router.get("/repairall", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM gold_repairs ORDER BY id DESC"
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (err) {
    console.error("Error fetching gold repair services:", err.message);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch gold repair services",
    });
  }
});

/**
 * @route   GET /goldrepair/:id
 * @desc    Get a single gold repair service by ID
 */
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "SELECT * FROM gold_repairs WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Gold repair service not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (err) {
    console.error("Error fetching gold repair service:", err.message);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch gold repair service",
    });
  }
});

/**
 * @route   PUT /goldrepair/update/:updateid
 * @desc    Update a gold repair service using JSON payload
 */
router.put("/update/:updateid", async (req, res) => {
  const { updateid } = req.params;
  const { title, description, price, repairimage } = req.body;

  try {
    // 1. Check if record exists
    const checkResult = await pool.query(
      "SELECT * FROM gold_repairs WHERE id = $1",
      [updateid]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Gold repair service not found",
      });
    }

    const currentRecord = checkResult.rows[0];
    const finalTitle = title !== undefined ? title : currentRecord.title;
    const finalDescription =
      description !== undefined ? description : currentRecord.description;
    const finalPrice =
      price !== undefined ? parseFloat(price) : currentRecord.price;
    let finalImageUrl = currentRecord.repairimage;

    // 2. Process image update if provided
    if (repairimage && repairimage !== currentRecord.repairimage) {
      if (repairimage.startsWith("data:image")) {
        const uploadResponse = await cloudinary.uploader.upload(repairimage, {
          folder: "gold_repairs",
        });
        finalImageUrl = uploadResponse.secure_url;
      } else {
        finalImageUrl = repairimage;
      }

      // Cleanup old image from Cloudinary
      try {
        const oldPublicId = getPublicIdFromUrl(currentRecord.repairimage);
        if (oldPublicId) {
          await cloudinary.uploader.destroy(oldPublicId);
        }
      } catch (cloudinaryErr) {
        console.error("Cloudinary cleanup error:", cloudinaryErr.message);
      }
    }

    // 3. Update database record
    const updateResult = await pool.query(
      `UPDATE gold_repairs 
       SET title = $1, description = $2, price = $3, repairimage = $4 
       WHERE id = $5 
       RETURNING *`,
      [finalTitle, finalDescription, finalPrice, finalImageUrl, updateid]
    );

    return res.status(200).json({
      success: true,
      message: "Gold repair service updated successfully",
      data: updateResult.rows[0],
    });
  } catch (err) {
    console.error("Error updating gold repair service:", err.message);
    return res.status(500).json({
      success: false,
      error: "Failed to update gold repair service",
    });
  }
});

/**
 * @route   DELETE /goldrepair/:id
 * @desc    Delete a gold repair service record and remove asset from Cloudinary
 */
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const checkResult = await pool.query(
      "SELECT repairimage FROM gold_repairs WHERE id = $1",
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Gold repair service not found",
      });
    }

    const imageUrl = checkResult.rows[0].repairimage;

    // Remove file from Cloudinary
    try {
      const publicId = getPublicIdFromUrl(imageUrl);
      if (publicId) {
        await cloudinary.uploader.destroy(publicId);
      }
    } catch (cloudinaryErr) {
      console.error("Cloudinary deletion bypassed:", cloudinaryErr.message);
    }

    // Delete record from PostgreSQL
    await pool.query("DELETE FROM gold_repairs WHERE id = $1", [id]);

    return res.status(200).json({
      success: true,
      message: "Gold repair service deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting gold repair service:", err.message);
    return res.status(500).json({
      success: false,
      error: "Failed to delete gold repair service",
    });
  }
});

module.exports = router;
