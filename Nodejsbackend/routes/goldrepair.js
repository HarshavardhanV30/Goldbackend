
const express = require("express");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../cloudinary");
const pool = require("../db");

const router = express.Router();

// ==========================================
// CLOUDINARY STORAGE
// ==========================================
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "gold_repairs",
    allowed_formats: ["jpg", "jpeg", "png", "webp", "gif"],
    public_id: (req, file) => {
      const filename = file.originalname
        .replace(/\.[^/.]+$/, "")
        .replace(/[^a-zA-Z0-9_-]/g, "-");

      return `gold-repair-${Date.now()}-${filename}`;
    },
  },
});

// ==========================================
// MULTER CONFIGURATION
// Frontend field name: jewelleryImages
// ==========================================
const upload = multer({
  storage,
  limits: {
    files: 10,
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(
        new Error(`Unsupported image type: ${file.mimetype}`)
      );
    }

    cb(null, true);
  },
});

// ==========================================
// IMAGE UPLOAD MIDDLEWARE
// ==========================================
const uploadJewelleryImages = (req, res, next) => {
  upload.array("jewelleryImages", 10)(req, res, (err) => {
    if (err) {
      console.error("CLOUDINARY UPLOAD ERROR:", err);

      return res.status(400).json({
        success: false,
        message: "Failed to upload images",
        error: err.message,
      });
    }

    console.log(
      "GOLD REPAIR UPLOADED IMAGES:",
      (req.files || []).map((file) => ({
        originalname: file.originalname,
        url: file.path,
        publicId: file.filename,
      }))
    );

    next();
  });
};

// ==========================================
// CLOUDINARY PUBLIC ID
// ==========================================
const getPublicIdFromUrl = (url) => {
  if (!url || typeof url !== "string") return null;

  try {
    const parsed = new URL(url);

    if (!parsed.hostname.endsWith("cloudinary.com")) {
      return null;
    }

    const uploadIndex = parsed.pathname.indexOf("/upload/");

    if (uploadIndex === -1) return null;

    let publicId = parsed.pathname.slice(
      uploadIndex + "/upload/".length
    );

    // Remove version prefix, such as v1234567890/
    publicId = publicId.replace(/^v\d+\//, "");

    // Remove image extension
    publicId = publicId.replace(/\.[^/.]+$/, "");

    return publicId || null;
  } catch (error) {
    console.error("PUBLIC ID ERROR:", error.message);
    return null;
  }
};

// ==========================================
// DELETE CLOUDINARY IMAGES
// ==========================================
const deleteCloudinaryImages = async (imageUrls) => {
  if (!Array.isArray(imageUrls)) return;

  for (const url of imageUrls) {
    const publicId = getPublicIdFromUrl(url);

    if (!publicId) continue;

    try {
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: "image",
      });

      console.log("CLOUDINARY DELETE RESULT:", publicId, result.result);
    } catch (error) {
      console.error(
        "CLOUDINARY DELETE ERROR:",
        publicId,
        error.message
      );
    }
  }
};

// ==========================================
// PARSE IMAGE URLS
// ==========================================
const parseBodyImages = (input) => {
  if (!input) return [];

  if (Array.isArray(input)) {
    return input.filter(
      (url) => typeof url === "string" && /^https?:\/\//i.test(url)
    );
  }

  try {
    const parsed = JSON.parse(input);

    if (Array.isArray(parsed)) {
      return parsed.filter(
        (url) => typeof url === "string" && /^https?:\/\//i.test(url)
      );
    }
  } catch (error) {
    // A single URL may be supplied as a string.
  }

  return /^https?:\/\//i.test(input) ? [input] : [];
};

// ==========================================
// SAFE NUMBER CONVERSION
// ==========================================
const parseAmount = (value, fallback = 0) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : NaN;
};

// ==========================================
// POST: ADD GOLD REPAIR BOOKING
// POST /gold-repairs/add
// ==========================================
router.post("/add", uploadJewelleryImages, async (req, res) => {
  try {
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
      shopName,
      mandal,
      district,
      state,
      pincode,
      specialInstructions,
      serviceFee,
      taxAmount,
      totalAmount,
      status,
      existingJewelleryImages,
    } = req.body;

    if (!serviceName || !fullName || !phone) {
      return res.status(400).json({
        success: false,
        error: "serviceName, fullName, and phone are required",
      });
    }

    // CloudinaryStorage supplies the uploaded URL in file.path.
    const uploadedImageUrls = (req.files || [])
      .map((file) => file.path)
      .filter(Boolean);

    const existingImageUrls = parseBodyImages(
      existingJewelleryImages
    );

    const imageUrls = [
      ...new Set([...uploadedImageUrls, ...existingImageUrls]),
    ];

    const numericServiceFee = parseAmount(serviceFee);
    const numericTaxAmount = parseAmount(taxAmount);
    const numericTotalAmount = parseAmount(totalAmount);

    if (
      !Number.isFinite(numericServiceFee) ||
      !Number.isFinite(numericTaxAmount) ||
      !Number.isFinite(numericTotalAmount)
    ) {
      return res.status(400).json({
        success: false,
        error: "Service fee, tax, and total amount must be valid numbers",
      });
    }

    const query = `
      INSERT INTO gold_repairs (
        service_id,
        service_name,
        jewellery_type,
        issue_description,
        jewellery_images,
        booking_date,
        start_time,
        end_time,
        service_type,
        customer_type,
        full_name,
        phone,
        shop_name,
        mandal,
        district,
        state,
        pincode,
        special_instructions,
        service_fee,
        tax_amount,
        total_amount,
        status
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18,
        $19, $20, $21, $22
      )
      RETURNING *;
    `;

    const values = [
      serviceId || null,
      serviceName,
      jewelleryType || null,
      issueDescription || null,
      imageUrls,
      bookingDate || null,
      startTime || null,
      endTime || null,
      serviceType || "DOORSTEP",
      customerType || "SELF",
      fullName,
      phone,
      shopName || null,
      mandal || null,
      district || null,
      state || null,
      pincode || null,
      specialInstructions || null,
      numericServiceFee,
      numericTaxAmount,
      numericTotalAmount,
      status || "pending",
    ];

    const result = await pool.query(query, values);
    const booking = result.rows[0];

    console.log("GOLD REPAIR SAVED IMAGE URLS:", booking.jewellery_images);

    return res.status(201).json({
      success: true,
      message: "Gold repair booking created successfully",
      data: {
        ...booking,
        jewellery_images: booking.jewellery_images || [],
      },
    });
  } catch (error) {
    console.error("GOLD REPAIR ADD ERROR:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Failed to create gold repair booking",
    });
  }
});

// ==========================================
// GET: ALL GOLD REPAIR BOOKINGS
// GET /gold-repairs/repairall
// ==========================================
router.get("/repairall", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM gold_repairs ORDER BY id DESC"
    );

    return res.status(200).json({
      success: true,
      data: result.rows.map((row) => ({
        ...row,
        jewellery_images: row.jewellery_images || [],
      })),
    });
  } catch (error) {
    console.error("GOLD REPAIR GET ALL ERROR:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch gold repair bookings",
    });
  }
});

// ==========================================
// GET: SINGLE GOLD REPAIR BOOKING
// GET /gold-repairs/:id
// ==========================================
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      "SELECT * FROM gold_repairs WHERE id = $1",
      [id]
    );

    if (!result.rows.length) {
      return res.status(404).json({
        success: false,
        error: "Gold repair booking not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        ...result.rows[0],
        jewellery_images: result.rows[0].jewellery_images || [],
      },
    });
  } catch (error) {
    console.error("GOLD REPAIR GET ERROR:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch gold repair booking",
    });
  }
});

// ==========================================
// PUT: UPDATE GOLD REPAIR BOOKING
// PUT /gold-repairs/update/:updateid
// ==========================================
router.put(
  "/update/:updateid",
  uploadJewelleryImages,
  async (req, res) => {
    try {
      const { updateid } = req.params;
      const body = req.body;

      const checkResult = await pool.query(
        "SELECT * FROM gold_repairs WHERE id = $1",
        [updateid]
      );

      if (!checkResult.rows.length) {
        return res.status(404).json({
          success: false,
          error: "Gold repair booking not found",
        });
      }

      const curr = checkResult.rows[0];
      let finalImageUrls = curr.jewellery_images || [];

      if (req.files && req.files.length > 0) {
        // Replace old images only after new uploads have succeeded.
        finalImageUrls = req.files
          .map((file) => file.path)
          .filter(Boolean);
      } else if (body.jewelleryImages !== undefined) {
        finalImageUrls = parseBodyImages(body.jewelleryImages);
      } else if (body.existingJewelleryImages !== undefined) {
        finalImageUrls = parseBodyImages(
          body.existingJewelleryImages
        );
      }

      const serviceFee =
        body.serviceFee !== undefined
          ? parseAmount(body.serviceFee)
          : curr.service_fee;

      const taxAmount =
        body.taxAmount !== undefined
          ? parseAmount(body.taxAmount)
          : curr.tax_amount;

      const totalAmount =
        body.totalAmount !== undefined
          ? parseAmount(body.totalAmount)
          : curr.total_amount;

      if (
        !Number.isFinite(Number(serviceFee)) ||
        !Number.isFinite(Number(taxAmount)) ||
        !Number.isFinite(Number(totalAmount))
      ) {
        return res.status(400).json({
          success: false,
          error: "Service fee, tax, and total amount must be valid numbers",
        });
      }

      const query = `
        UPDATE gold_repairs SET
          service_id = $1,
          service_name = $2,
          jewellery_type = $3,
          issue_description = $4,
          jewellery_images = $5,
          booking_date = $6,
          start_time = $7,
          end_time = $8,
          service_type = $9,
          customer_type = $10,
          full_name = $11,
          phone = $12,
          shop_name = $13,
          mandal = $14,
          district = $15,
          state = $16,
          pincode = $17,
          special_instructions = $18,
          service_fee = $19,
          tax_amount = $20,
          total_amount = $21,
          status = $22,
          updated_at = NOW()
        WHERE id = $23
        RETURNING *;
      `;

      const values = [
        body.serviceId !== undefined ? body.serviceId : curr.service_id,
        body.serviceName !== undefined ? body.serviceName : curr.service_name,
        body.jewelleryType !== undefined ? body.jewelleryType : curr.jewellery_type,
        body.issueDescription !== undefined ? body.issueDescription : curr.issue_description,
        finalImageUrls,
        body.bookingDate !== undefined ? body.bookingDate : curr.booking_date,
        body.startTime !== undefined ? body.startTime : curr.start_time,
        body.endTime !== undefined ? body.endTime : curr.end_time,
        body.serviceType !== undefined ? body.serviceType : curr.service_type,
        body.customerType !== undefined ? body.customerType : curr.customer_type,
        body.fullName !== undefined ? body.fullName : curr.full_name,
        body.phone !== undefined ? body.phone : curr.phone,
        body.shopName !== undefined ? body.shopName : curr.shop_name,
        body.mandal !== undefined ? body.mandal : curr.mandal,
        body.district !== undefined ? body.district : curr.district,
        body.state !== undefined ? body.state : curr.state,
        body.pincode !== undefined ? body.pincode : curr.pincode,
        body.specialInstructions !== undefined
          ? body.specialInstructions
          : curr.special_instructions,
        serviceFee,
        taxAmount,
        totalAmount,
        body.status !== undefined ? body.status : curr.status,
        updateid,
      ];

      const updateResult = await pool.query(query, values);

      // Delete previous images only after the database update succeeds.
      if (req.files && req.files.length > 0) {
        await deleteCloudinaryImages(curr.jewellery_images || []);
      }

      return res.status(200).json({
        success: true,
        message: "Gold repair booking updated successfully",
        data: {
          ...updateResult.rows[0],
          jewellery_images: updateResult.rows[0].jewellery_images || [],
        },
      });
    } catch (error) {
      console.error("GOLD REPAIR UPDATE ERROR:", error);

      return res.status(500).json({
        success: false,
        error: error.message || "Failed to update gold repair booking",
      });
    }
  }
);

// ==========================================
// DELETE: GOLD REPAIR BOOKING
// DELETE /gold-repairs/:id
// ==========================================
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const checkResult = await pool.query(
      "SELECT jewellery_images FROM gold_repairs WHERE id = $1",
      [id]
    );

    if (!checkResult.rows.length) {
      return res.status(404).json({
        success: false,
        error: "Gold repair booking not found",
      });
    }

    await deleteCloudinaryImages(
      checkResult.rows[0].jewellery_images || []
    );

    await pool.query(
      "DELETE FROM gold_repairs WHERE id = $1",
      [id]
    );

    return res.status(200).json({
      success: true,
      message: "Gold repair booking deleted successfully",
    });
  } catch (error) {
    console.error("GOLD REPAIR DELETE ERROR:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to delete gold repair booking",
    });
  }
});

module.exports = router;
