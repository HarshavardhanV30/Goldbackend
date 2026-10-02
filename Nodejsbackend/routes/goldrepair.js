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

// Configure Multer for single/multiple image uploads (fieldName: jewelleryImages)
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
 * @desc    Create a new gold repair booking service
 */
router.post(
  "/add",
  upload.single("jewelleryImages"),
  async (req, res) => {
    const {
      serviceId,
      serviceName,
      jewelleryType,
      issueDescription,
      bookingDate,
      startTime,
      endTime,
      serviceType,
      customerType,
      fullName,
      phone,
      houseNo,
      street,
      area,
      landmark,
      city,
      district,
      state,
      pincode,
      specialInstructions,
      serviceFee,
      taxAmount,
      totalAmount,
      jewelleryImages, // JSON string or URL if passed in body
    } = req.body;

    // Basic required field check
    if (!serviceName || !fullName || !phone) {
      return res.status(400).json({
        success: false,
        error: "serviceName, fullName, and phone fields are required",
      });
    }

    // Determine image URL from file upload or body payload
    let imageUrl = req.file ? req.file.path : jewelleryImages;

    try {
      const numericServiceFee =
        serviceFee !== undefined && serviceFee !== null ? parseFloat(serviceFee) : 0;
      const numericTaxAmount =
        taxAmount !== undefined && taxAmount !== null ? parseFloat(taxAmount) : 0;
      const numericTotalAmount =
        totalAmount !== undefined && totalAmount !== null ? parseFloat(totalAmount) : 0;

      const query = `
        INSERT INTO gold_repairs (
          service_id,
          service_name,
          jewellery_type,
          issue_description,
          booking_date,
          start_time,
          end_time,
          service_type,
          customer_type,
          full_name,
          phone,
          house_no,
          street,
          area,
          landmark,
          city,
          district,
          state,
          pincode,
          special_instructions,
          service_fee,
          tax_amount,
          total_amount,
          jewellery_images
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          $21, $22, $23, $24
        )
        RETURNING *;
      `;

      const values = [
        serviceId || null,
        serviceName,
        jewelleryType || null,
        issueDescription || null,
        bookingDate || null,
        startTime || null,
        endTime || null,
        serviceType || null,
        customerType || null,
        fullName,
        phone,
        houseNo || null,
        street || null,
        area || null,
        landmark || null,
        city || null,
        district || null,
        state || null,
        pincode || null,
        specialInstructions || null,
        numericServiceFee,
        numericTaxAmount,
        numericTotalAmount,
        imageUrl || null,
      ];

      const result = await pool.query(query, values);

      return res.status(201).json({
        success: true,
        message: "Gold repair booking created successfully",
        data: result.rows[0],
      });
    } catch (err) {
      console.error("Error creating gold repair booking:", err.message);
      return res.status(500).json({
        success: false,
        error: err.message || "Failed to create gold repair booking",
      });
    }
  }
);

/**
 * @route   GET /gold-repairs/repairall
 * @desc    Get all gold repair bookings
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
    console.error("Error fetching gold repair bookings:", err.message);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch gold repair bookings",
    });
  }
});

/**
 * @route   GET /gold-repairs/:id
 * @desc    Get a single gold repair booking by ID
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
        error: "Gold repair booking not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (err) {
    console.error("Error fetching gold repair booking:", err.message);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch gold repair booking",
    });
  }
});

/**
 * @route   PUT /gold-repairs/update/:updateid
 * @desc    Update a gold repair booking
 */
router.put(
  "/update/:updateid",
  upload.single("jewelleryImages"),
  async (req, res) => {
    const { updateid } = req.params;
    const body = req.body;

    try {
      const checkResult = await pool.query(
        "SELECT * FROM gold_repairs WHERE id = $1",
        [updateid]
      );

      if (checkResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: "Gold repair booking not found",
        });
      }

      const curr = checkResult.rows[0];
      let finalImageUrl = curr.jewellery_images;

      if (req.file) {
        finalImageUrl = req.file.path;
        try {
          const oldPublicId = getPublicIdFromUrl(curr.jewellery_images);
          if (oldPublicId) {
            await cloudinary.uploader.destroy(oldPublicId);
          }
        } catch (cloudinaryErr) {
          console.error(
            "Failed to delete old image from Cloudinary:",
            cloudinaryErr.message
          );
        }
      } else if (body.jewelleryImages) {
        finalImageUrl = body.jewelleryImages;
      }

      const query = `
        UPDATE gold_repairs SET
          service_id = $1,
          service_name = $2,
          jewellery_type = $3,
          issue_description = $4,
          booking_date = $5,
          start_time = $6,
          end_time = $7,
          service_type = $8,
          customer_type = $9,
          full_name = $10,
          phone = $11,
          house_no = $12,
          street = $13,
          area = $14,
          landmark = $15,
          city = $16,
          district = $17,
          state = $18,
          pincode = $19,
          special_instructions = $20,
          service_fee = $21,
          tax_amount = $22,
          total_amount = $23,
          jewellery_images = $24
        WHERE id = $25
        RETURNING *;
      `;

      const values = [
        body.serviceId !== undefined ? body.serviceId : curr.service_id,
        body.serviceName !== undefined ? body.serviceName : curr.service_name,
        body.jewelleryType !== undefined ? body.jewelleryType : curr.jewellery_type,
        body.issueDescription !== undefined ? body.issueDescription : curr.issue_description,
        body.bookingDate !== undefined ? body.bookingDate : curr.booking_date,
        body.startTime !== undefined ? body.startTime : curr.start_time,
        body.endTime !== undefined ? body.endTime : curr.end_time,
        body.serviceType !== undefined ? body.serviceType : curr.service_type,
        body.customerType !== undefined ? body.customerType : curr.customer_type,
        body.fullName !== undefined ? body.fullName : curr.full_name,
        body.phone !== undefined ? body.phone : curr.phone,
        body.houseNo !== undefined ? body.houseNo : curr.house_no,
        body.street !== undefined ? body.street : curr.street,
        body.area !== undefined ? body.area : curr.area,
        body.landmark !== undefined ? body.landmark : curr.landmark,
        body.city !== undefined ? body.city : curr.city,
        body.district !== undefined ? body.district : curr.district,
        body.state !== undefined ? body.state : curr.state,
        body.pincode !== undefined ? body.pincode : curr.pincode,
        body.specialInstructions !== undefined ? body.specialInstructions : curr.special_instructions,
        body.serviceFee !== undefined ? parseFloat(body.serviceFee) : curr.service_fee,
        body.taxAmount !== undefined ? parseFloat(body.taxAmount) : curr.tax_amount,
        body.totalAmount !== undefined ? parseFloat(body.totalAmount) : curr.total_amount,
        finalImageUrl,
        updateid,
      ];

      const updateResult = await pool.query(query, values);

      return res.status(200).json({
        success: true,
        message: "Gold repair booking updated successfully",
        data: updateResult.rows[0],
      });
    } catch (err) {
      console.error("Error updating gold repair booking:", err.message);
      return res.status(500).json({
        success: false,
        error: "Failed to update gold repair booking",
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
      "SELECT jewellery_images FROM gold_repairs WHERE id = $1",
      [id]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Gold repair booking not found",
      });
    }

    const imageUrl = checkResult.rows[0].jewellery_images;

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
      message: "Gold repair booking deleted successfully",
    });
  } catch (err) {
    console.error("Error deleting gold repair booking:", err.message);
    return res.status(500).json({
      success: false,
      error: "Failed to delete gold repair booking",
    });
  }
});

module.exports = router;
