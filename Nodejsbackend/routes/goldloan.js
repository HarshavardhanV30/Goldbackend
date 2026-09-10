const express = require("express");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../cloudinary"); // Your Cloudinary config
const pool = require("../db");
const router = express.Router();

// ✅ Multer storage using Cloudinary
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "goldloan",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
    public_id: (req, file) => Date.now() + "-" + file.originalname,
  },
});

const upload = multer({ storage });

// Helper function to extract public ID from Cloudinary URL
const getPublicIdFromUrl = (url) => {
  const parts = url.split("/");
  const filename = parts[parts.length - 1].split(".")[0];
  return `goldloan/${filename}`;
};

/**
 * 🔹 POST /goldloan/add
 */
router.post("/add", upload.array("image", 5), async (req, res) => {
  const {
    bank,
    fullname,
    mobile,
    address,
    goldweight,
    goldtype,
    idproof,
    loanamount,
    remarks,
  } = req.body;

  const files = req.files || [];

  if (files.length === 0) {
    return res.status(400).json({ error: "No images uploaded" });
  }

  try {
    const imagePaths = files.map((file) => file.path);
    const createdAt = new Date().toISOString();

    const result = await pool.query(
      `INSERT INTO goldloanrequest (
        image, bank, fullname, mobile, address,
        goldweight, goldtype, idproof, loanamount,
        remarks, created_at
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10, $11
      ) RETURNING id`,
      [
        JSON.stringify(imagePaths),
        bank,
        fullname,
        mobile,
        address,
        goldweight,
        goldtype,
        idproof,
        parseFloat(loanamount),
        remarks,
        createdAt,
      ]
    );

    res.status(201).json({
      message: "Gold loan request added successfully",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("Error inserting gold loan request:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * 🔹 GET /goldloan/all
 */
router.get("/all", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM goldloanrequest ORDER BY created_at DESC");

    res.status(200).json({
      message: "All gold loan requests fetched successfully",
      data: result.rows,
    });
  } catch (err) {
    console.error("Error fetching gold loan requests:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * 🔹 PUT /goldloan/:id
 */
router.put("/:id", upload.array("image", 5), async (req, res) => {
  const { id } = req.params;
  const {
    bank,
    fullname,
    mobile,
    address,
    goldweight,
    goldtype,
    idproof,
    loanamount,
    remarks,
  } = req.body;

  try {
    // Check if record exists
    const existingRecord = await pool.query(
      "SELECT * FROM goldloanrequest WHERE id = $1",
      [id]
    );

    if (existingRecord.rows.length === 0) {
      return res.status(404).json({ error: "Record not found" });
    }

    let imagePaths = existingRecord.rows[0].image || [];
    const files = req.files || [];

    // If new images are uploaded, delete old images from Cloudinary and update paths
    if (files.length > 0) {
      await Promise.all(
        imagePaths.map((url) => {
          const publicId = getPublicIdFromUrl(url);
          return cloudinary.uploader.destroy(publicId);
        })
      );
      imagePaths = files.map((file) => file.path);
    }

    const result = await pool.query(
      `UPDATE goldloanrequest SET 
        image = $1, bank = $2, fullname = $3, mobile = $4, address = $5,
        goldweight = $6, goldtype = $7, idproof = $8, loanamount = $9, remarks = $10
      WHERE id = $11 RETURNING *`,
      [
        JSON.stringify(imagePaths),
        bank,
        fullname,
        mobile,
        address,
        goldweight,
        goldtype,
        idproof,
        loanamount ? parseFloat(loanamount) : null,
        remarks,
        id,
      ]
    );

    res.status(200).json({
      message: "Gold loan request updated successfully",
      data: result.rows[0],
    });
  } catch (err) {
    console.error("Error updating gold loan request:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/**
 * 🔹 DELETE /goldloan/:id
 */
router.delete("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      "SELECT image FROM goldloanrequest WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Record not found" });
    }

    const imagePaths = result.rows[0].image || [];

    // ✅ Delete images from Cloudinary
    await Promise.all(
      imagePaths.map((url) => {
        const publicId = getPublicIdFromUrl(url);
        return cloudinary.uploader.destroy(publicId);
      })
    );

    // ✅ Delete from PostgreSQL
    await pool.query("DELETE FROM goldloanrequest WHERE id = $1", [id]);

    res.status(200).json({ message: "Gold loan request deleted successfully" });
  } catch (err) {
    console.error("Error deleting record:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
