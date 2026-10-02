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

// ==========================================
// HELPER FUNCTION FOR CLOUDINARY CLEANUP
// ==========================================
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
 * @route   POST /gold-repairs/add
 * @desc    Create a new gold repair service
 */
router.post("/add", upload.single("repairimage"), async (req, res) => {
  const { title, description, price, jewellery_type, repairimage } = req.body;

  if (!title) {
    return res.status(400).json({
      success: false,
      error: "Title field is required",
    });
  }

  // Determine image URL from file upload or JSON body
  let imageUrl = req.file ? req.file.path : repairimage;

  if (!imageUrl) {
    return res.status(400).json({
      success: false,
      error: "Repair image file or URL is required",
    });
  }

  try {
    const numericPrice = price !== undefined && price !== null ? parseFloat(price) : null;

    // INSERT query handling fields safely
    const result = await pool.query(
      `INSERT INTO gold_repairs (title, description, price, repairimage) 
       VALUES ($1, $2, $3, $4) 
       RETURNING *`,
      [title, description || null, numericPrice, imageUrl]
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
 * @route   GET /gold-repairs/repairall
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
 * @route   GET /gold-repairs/:id
 * @desc    Get a single gold repair service by ID
 */
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query("SELECT * FROM gold_repairs WHERE id = $1", [
      id,
    ]);

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
 * @route   PUT /gold-repairs/update/:updateid
 * @desc    Update a gold repair service
 */
router.put(
  "/update/:updateid",
  upload.single("repairimage"),
  async (req, res) => {
    const { updateid } = req.params;
    const { title, description, price, repairimage } = req.body;

    try {
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
      const finalPrice = price !== undefined ? parseFloat(price) : currentRecord.price;
      let finalImageUrl = currentRecord.repairimage;

      if (req.file) {
        finalImageUrl = req.file.path;

        try {
          const oldPublicId = getPublicIdFromUrl(currentRecord.repairimage);
          if (oldPublicId) {
            await cloudinary.uploader.destroy(oldPublicId);
          }
        } catch (cloudinaryErr) {
          console.error(
            "Failed to delete old image from Cloudinary:",
            cloudinaryErr.message
          );
        }
      } else if (repairimage) {
        finalImageUrl = repairimage;
      }

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
  }
);

/**
 * @route   DELETE /gold-repairs/:id
 * @desc    Delete gold repair service and remove image from Cloudinary
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

    try {
      const publicId = getPublicIdFromUrl(imageUrl);
      if (publicId) {
        await cloudinary.uploader.destroy(publicId);
      }
    } catch (cloudinaryErr) {
      console.error(
        "Cloudinary asset deletion bypassed/failed:",
        cloudinaryErr.message
      );
    }

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
