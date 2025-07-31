const express = require("express");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../cloudinary"); // Your Cloudinary config
const pool = require("../db"); // PostgreSQL pool
const router = express.Router();

// ✅ Multer storage using Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "goldloan",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
    public_id: (req, file) => `${Date.now()}-${file.originalname}`,
  },
});

const upload = multer({ storage });

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
      id: result.rows[0].id,
      data: {
        image: imagePaths,
        bank,
        fullname,
        mobile,
        address,
        goldweight,
        goldtype,
        idproof,
        loanamount: parseFloat(loanamount),
        remarks,
        createdAt,
      },
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
    const result = await pool.query(
      "SELECT * FROM goldloanrequest ORDER BY created_at ASC"
    );

    const data = result.rows.map((row) => ({
      ...row,
      image: JSON.parse(row.image || "[]"), // Parse image array back from JSON
    }));

    res.status(200).json(data);
  } catch (err) {
    console.error("Error fetching records:", err);
    res.status(500).json({ error: "Failed to fetch records" });
  }
});

/**
 * 🔹 DELETE /goldloan/:id
 */
router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "SELECT * FROM goldloanrequest WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: "Record not found" });
    }

    const record = result.rows[0];
    const imagePaths = JSON.parse(record.image || "[]");

    // Delete images from Cloudinary
    await Promise.all(
      imagePaths.map(async (url) => {
        try {
          const publicId = url.split("/").pop().split(".")[0]; // crude way to get public ID
          await cloudinary.uploader.destroy(`goldloan/${publicId}`);
        } catch (err) {
          console.warn("Failed to delete Cloudinary image:", err.message);
        }
      })
    );

    // Delete from PostgreSQL
    await pool.query("DELETE FROM goldloanrequest WHERE id = $1", [id]);

    res.status(200).json({ message: "Gold loan request deleted successfully" });
  } catch (err) {
    console.error("Error deleting record:", err);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;
