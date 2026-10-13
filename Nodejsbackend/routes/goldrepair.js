
const express = require("express");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../cloudinary");
const pool = require("../db");

const router = express.Router();

const MAX_IMAGES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
]);

// ==========================================
// CLOUDINARY STORAGE
// ==========================================
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "gold_repairs",
    resource_type: "image",
    allowed_formats: ["jpg", "jpeg", "png", "webp", "gif"],
    public_id: (req, file) => {
      const safeName = (file.originalname || "jewellery")
        .replace(/\.[^/.]+$/, "")
        .replace(/[^a-zA-Z0-9_-]/g, "-")
        .slice(0, 70);

      return `gold-repair-${Date.now()}-${safeName}`;
    },
  },
});

// ==========================================
// MULTER CONFIGURATION
// File field name: jewelleryImages
// ==========================================
const upload = multer({
  storage,
  limits: {
    files: MAX_IMAGES,
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (req, file, cb) => {
    console.log("Incoming gold repair image:", {
      name: file.originalname,
      mimeType: file.mimetype,
    });

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return cb(
        new Error(
          `Invalid image file: ${file.mimetype || "unknown MIME type"}`
        )
      );
    }

    cb(null, true);
  },
});

// ==========================================
// IMAGE UPLOAD MIDDLEWARE
// ==========================================
const uploadJewelleryImages = (req, res, next) => {
  upload.array("jewelleryImages", MAX_IMAGES)(req, res, (err) => {
    if (err) {
      console.error("GOLD REPAIR UPLOAD ERROR:", err);

      return res.status(400).json({
        success: false,
        error: err.message || "Image upload failed",
      });
    }

    console.log(
      "GOLD REPAIR CLOUDINARY UPLOADS:",
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
// PARSE IMAGE INPUT
// Supports arrays, JSON arrays, URLs, and data URLs
// ==========================================
const parseImageInput = (input) => {
  if (input === undefined || input === null || input === "") {
    return [];
  }

  if (Array.isArray(input)) {
    return input;
  }

  if (typeof input !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(input);

    if (Array.isArray(parsed)) {
      return parsed;
    }

    if (typeof parsed === "string") {
      return [parsed];
    }
  } catch (_) {
    // Input may be a single URL or base64 data URL.
  }

  return [input];
};

const isHttpUrl = (value) => {
  if (typeof value !== "string") return false;

  try {
    const url = new URL(value);

    return url.protocol === "https:" || url.protocol === "http:";
  } catch (_) {
    return false;
  }
};

// ==========================================
// UPLOAD JSON BASE64 IMAGES TO CLOUDINARY
// Ordinary URLs are retained as URLs.
// ==========================================
const normalizeImageInputs = async (input) => {
  const items = parseImageInput(input);
  const imageUrls = [];

  for (const item of items) {
    if (typeof item !== "string") {
      throw new Error("Each jewellery image must be a URL or base64 data URL");
    }

    if (/^data:image\/(jpeg|jpg|png|webp|gif);base64,/i.test(item)) {
      const result = await cloudinary.uploader.upload(item, {
        folder: "gold_repairs",
        resource_type: "image",
      });

      if (result.secure_url) {
        imageUrls.push(result.secure_url);
      }
    } else if (/^data:image\//i.test(item)) {
      throw new Error("Unsupported base64 image format");
    } else if (isHttpUrl(item)) {
      imageUrls.push(item);
    } else {
      throw new Error(
        "Invalid image input. Provide an HTTP/HTTPS URL or a valid base64 image data URL"
      );
    }
  }

  return imageUrls;
};

// ==========================================
// EXTRACT CLOUDINARY PUBLIC ID
// ==========================================
const getPublicIdFromUrl = (imageUrl) => {
  if (typeof imageUrl !== "string") return null;

  try {
    const parsed = new URL(imageUrl);

    if (!parsed.hostname.endsWith("cloudinary.com")) {
      return null;
    }

    const marker = "/upload/";
    const index = parsed.pathname.indexOf(marker);

    if (index === -1) return null;

    let publicId = parsed.pathname.slice(index + marker.length);

    // Remove version prefix.
    publicId = publicId.replace(/^v\d+\//, "");

    // Remove file extension.
    publicId = publicId.replace(/\.[^/.]+$/, "");

    return publicId || null;
  } catch (_) {
    return null;
  }
};

// ==========================================
// DELETE CLOUDINARY IMAGES
// ==========================================
const deleteCloudinaryImages = async (imageUrls) => {
  if (!Array.isArray(imageUrls)) return;

  for (const imageUrl of imageUrls) {
    const publicId = getPublicIdFromUrl(imageUrl);

    if (!publicId) continue;

    try {
      const result = await cloudinary.uploader.destroy(publicId, {
        resource_type: "image",
      });

      console.log(
        "CLOUDINARY DELETE:",
        publicId,
        result.result
      );
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
// NUMBER CONVERSION
// ==========================================
const parseAmount = (value, fallback = 0) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const number = Number(value);

  return Number.isFinite(number) ? number : NaN;
};

const firstDefined = (body, camelKey, currentValue) => {
  return body[camelKey] !== undefined
    ? body[camelKey]
    : currentValue;
};

// ==========================================
// POST: ADD GOLD REPAIR BOOKING
// POST /gold-repairs/add
// Supports multipart files and JSON image inputs.
// ==========================================
router.post("/add", uploadJewelleryImages, async (req, res) => {
  try {
    const body = req.body || {};

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
    } = body;

    if (!serviceName || !fullName || !phone) {
      return res.status(400).json({
        success: false,
        error: "serviceName, fullName, and phone are required",
      });
    }

    // Files uploaded by Multer are already stored in Cloudinary.
    const uploadedFileUrls = (req.files || [])
      .map((file) => file.path)
      .filter(Boolean);

    // Accept URLs or base64 images from JSON/form-data text.
    const suppliedInput =
      body.jewelleryImages !== undefined
        ? body.jewelleryImages
        : existingJewelleryImages;

    const suppliedImageUrls = await normalizeImageInputs(suppliedInput);

    const imageUrls = [
      ...new Set([...uploadedFileUrls, ...suppliedImageUrls]),
    ];

    if (imageUrls.length > MAX_IMAGES) {
      return res.status(400).json({
        success: false,
        error: `A maximum of ${MAX_IMAGES} images is allowed`,
      });
    }

    const numericServiceFee = parseAmount(serviceFee);
    const numericTaxAmount = parseAmount(taxAmount);
    const numericTotalAmount = parseAmount(totalAmount);

    if (
      ![
        numericServiceFee,
        numericTaxAmount,
        numericTotalAmount,
      ].every(Number.isFinite)
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

    console.log(
      "GOLD REPAIR SAVED IMAGE URLS:",
      booking.jewellery_images
    );

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
    const result = await pool.query(
      "SELECT * FROM gold_repairs WHERE id = $1",
      [req.params.id]
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
// New files replace existing images.
// Omit image fields to keep existing images.
// ==========================================
router.put(
  "/update/:updateid",
  uploadJewelleryImages,
  async (req, res) => {
    let newlyUploadedUrls = [];

    try {
      const { updateid } = req.params;
      const body = req.body || {};

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

      const current = checkResult.rows[0];

      newlyUploadedUrls = (req.files || [])
        .map((file) => file.path)
        .filter(Boolean);

      let finalImageUrls = current.jewellery_images || [];

      if (newlyUploadedUrls.length > 0) {
        finalImageUrls = newlyUploadedUrls;
      } else if (body.jewelleryImages !== undefined) {
        finalImageUrls = await normalizeImageInputs(
          body.jewelleryImages
        );
      } else if (body.existingJewelleryImages !== undefined) {
        finalImageUrls = await normalizeImageInputs(
          body.existingJewelleryImages
        );
      }

      if (finalImageUrls.length > MAX_IMAGES) {
        return res.status(400).json({
          success: false,
          error: `A maximum of ${MAX_IMAGES} images is allowed`,
        });
      }

      const serviceFee =
        body.serviceFee !== undefined
          ? parseAmount(body.serviceFee)
          : current.service_fee;

      const taxAmount =
        body.taxAmount !== undefined
          ? parseAmount(body.taxAmount)
          : current.tax_amount;

      const totalAmount =
        body.totalAmount !== undefined
          ? parseAmount(body.totalAmount)
          : current.total_amount;

      if (
        ![
          Number(serviceFee),
          Number(taxAmount),
          Number(totalAmount),
        ].every(Number.isFinite)
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
        firstDefined(body, "serviceId", current.service_id),
        firstDefined(body, "serviceName", current.service_name),
        firstDefined(body, "jewelleryType", current.jewellery_type),
        firstDefined(body, "issueDescription", current.issue_description),
        finalImageUrls,
        firstDefined(body, "bookingDate", current.booking_date),
        firstDefined(body, "startTime", current.start_time),
        firstDefined(body, "endTime", current.end_time),
        firstDefined(body, "serviceType", current.service_type),
        firstDefined(body, "customerType", current.customer_type),
        firstDefined(body, "fullName", current.full_name),
        firstDefined(body, "phone", current.phone),
        firstDefined(body, "shopName", current.shop_name),
        firstDefined(body, "mandal", current.mandal),
        firstDefined(body, "district", current.district),
        firstDefined(body, "state", current.state),
        firstDefined(body, "pincode", current.pincode),
        firstDefined(
          body,
          "specialInstructions",
          current.special_instructions
        ),
        serviceFee,
        taxAmount,
        totalAmount,
        firstDefined(body, "status", current.status),
        updateid,
      ];

      const updateResult = await pool.query(query, values);

      // Remove old files only after the database update succeeds.
      if (newlyUploadedUrls.length > 0) {
        await deleteCloudinaryImages(
          current.jewellery_images || []
        );
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

    // Delete the database record first.
    await pool.query(
      "DELETE FROM gold_repairs WHERE id = $1",
      [id]
    );

    // Then remove associated Cloudinary images.
    await deleteCloudinaryImages(
      checkResult.rows[0].jewellery_images || []
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
