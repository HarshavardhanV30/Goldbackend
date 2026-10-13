const express = require("express");
const multer = require("multer");
const cloudinary = require("../cloudinary");
const pool = require("../db");

const router = express.Router();

const MAX_IMAGES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

// Store uploads in memory temporarily before uploading to Cloudinary.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    files: MAX_IMAGES,
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter: (req, file, callback) => {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      return callback(
        new Error(`Unsupported image format: ${file.mimetype}`)
      );
    }

    callback(null, true);
  },
});

// Upload a memory buffer to Cloudinary.
const uploadToCloudinary = (buffer, mimetype, originalname) => {
  return new Promise((resolve, reject) => {
    const extension = originalname.includes(".")
      ? originalname.split(".").pop().toLowerCase()
      : "jpg";

    const publicId =
      `gold-repair-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;

    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "gold_repairs",
        resource_type: "image",
        public_id: publicId,
        format: extension,
      },
      (error, result) => {
        if (error) return reject(error);

        if (!result || !result.secure_url) {
          return reject(new Error("Cloudinary did not return an image URL"));
        }

        resolve({
          url: result.secure_url,
          publicId: result.public_id,
        });
      }
    );

    stream.end(buffer);
  });
};

const deleteCloudinaryImages = async (images = []) => {
  for (const image of images) {
    try {
      const publicId =
        typeof image === "string" ? getPublicId(image) : image.publicId;

      if (publicId) {
        await cloudinary.uploader.destroy(publicId, {
          resource_type: "image",
        });
      }
    } catch (error) {
      console.error("Cloudinary deletion error:", error.message);
    }
  }
};

const getPublicId = (imageUrl) => {
  try {
    const url = new URL(imageUrl);

    if (!url.hostname.endsWith("cloudinary.com")) return null;

    const marker = "/upload/";
    const index = url.pathname.indexOf(marker);

    if (index === -1) return null;

    return url.pathname
      .slice(index + marker.length)
      .replace(/^v\d+\//, "")
      .replace(/\.[^/.]+$/, "");
  } catch {
    return null;
  }
};

const parseAmount = (value, fallback = 0) => {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
};

const parseImageInput = (input) => {
  if (input === undefined || input === null || input === "") return [];

  if (Array.isArray(input)) return input;

  if (typeof input !== "string") {
    throw new Error("Image input must be a URL or an array of URLs");
  }

  try {
    const parsed = JSON.parse(input);

    if (Array.isArray(parsed)) return parsed;
    if (typeof parsed === "string") return [parsed];
  } catch {
    // Treat a non-JSON string as one URL.
  }

  return [input];
};

const normalizeImageUrls = (input) => {
  return parseImageInput(input).map((item) => {
    if (typeof item !== "string") {
      throw new Error("Each image must be an HTTP or HTTPS URL");
    }

    let url;

    try {
      url = new URL(item);
    } catch {
      throw new Error(
        "Invalid image URL. Upload files using multipart/form-data."
      );
    }

    if (!["http:", "https:"].includes(url.protocol)) {
      throw new Error("Image URL must use HTTP or HTTPS");
    }

    return item;
  });
};

// Convert uploaded files to Cloudinary URLs.
const processImages = async (files = [], body = {}) => {
  const uploaded = [];

  try {
    for (const file of files) {
      const result = await uploadToCloudinary(
        file.buffer,
        file.mimetype,
        file.originalname
      );

      uploaded.push(result);
    }

    const extraInput =
      body.jewelleryImages !== undefined
        ? body.jewelleryImages
        : body.existingJewelleryImages;

    // The field jewelleryImages should contain files for normal uploads.
    // Text values are accepted only when they are HTTP/HTTPS URLs.
    const extraUrls = normalizeImageUrls(extraInput);

    const uploadedUrls = uploaded.map((image) => image.url);
    const urls = [...new Set([...uploadedUrls, ...extraUrls])];

    if (urls.length > MAX_IMAGES) {
      throw new Error(`A maximum of ${MAX_IMAGES} images is allowed`);
    }

    return { urls, uploaded };
  } catch (error) {
    await deleteCloudinaryImages(uploaded);
    throw error;
  }
};

// Multer errors must be handled before the route handler runs.
const uploadJewelleryImages = (req, res, next) => {
  upload.array("jewelleryImages", MAX_IMAGES)(req, res, (error) => {
    if (error) {
      console.error("Gold repair multipart upload error:", error);

      return res.status(400).json({
        success: false,
        error: error.message || "Image upload failed",
      });
    }

    next();
  });
};

// POST /goldrepair/add
router.post("/add", uploadJewelleryImages, async (req, res) => {
  let uploaded = [];

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
    } = body;

    if (!serviceName || !fullName || !phone) {
      return res.status(400).json({
        success: false,
        error: "serviceName, fullName, and phone are required",
      });
    }

    const processed = await processImages(req.files, body);
    uploaded = processed.uploaded;
    const imageUrls = processed.urls;

    const fee = parseAmount(serviceFee);
    const tax = parseAmount(taxAmount);
    const total = parseAmount(totalAmount);

    if (![fee, tax, total].every(Number.isFinite)) {
      await deleteCloudinaryImages(uploaded);

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
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22
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
      fee,
      tax,
      total,
      status || "pending",
    ];

    const result = await pool.query(query, values);

    console.log("Gold repair booking created:", result.rows[0].id);
    console.log("Cloudinary image URLs:", imageUrls);

    return res.status(201).json({
      success: true,
      message: "Gold repair booking created successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("GOLD REPAIR ADD ERROR:", error);

    await deleteCloudinaryImages(uploaded);

    return res.status(500).json({
      success: false,
      error: error.message || "Failed to create gold repair booking",
      databaseCode: error.code || null,
      detail: error.detail || null,
    });
  }
});

// GET /goldrepair/repairall
router.get("/repairall", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM gold_repairs ORDER BY id DESC"
    );

    return res.status(200).json({
      success: true,
      data: result.rows,
    });
  } catch (error) {
    console.error("GOLD REPAIR GET ALL ERROR:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
      databaseCode: error.code || null,
    });
  }
});

// GET /goldrepair/:id
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
      data: result.rows[0],
    });
  } catch (error) {
    console.error("GOLD REPAIR GET ERROR:", error);

    return res.status(500).json({
      success: false,
      error: error.message,
      databaseCode: error.code || null,
    });
  }
});

// PUT /goldrepair/update/:updateid
router.put(
  "/update/:updateid",
  uploadJewelleryImages,
  async (req, res) => {
    let uploaded = [];

    try {
      const { updateid } = req.params;
      const body = req.body || {};

      const existingResult = await pool.query(
        "SELECT * FROM gold_repairs WHERE id = $1",
        [updateid]
      );

      if (!existingResult.rows.length) {
        return res.status(404).json({
          success: false,
          error: "Gold repair booking not found",
        });
      }

      const current = existingResult.rows[0];

      let imageUrls = current.jewellery_images || [];

      if ((req.files || []).length > 0) {
        const processed = await processImages(req.files, body);
        uploaded = processed.uploaded;
        imageUrls = processed.urls;
      } else if (
        body.jewelleryImages !== undefined ||
        body.existingJewelleryImages !== undefined
      ) {
        imageUrls = normalizeImageUrls(
          body.jewelleryImages !== undefined
            ? body.jewelleryImages
            : body.existingJewelleryImages
        );
      }

      const fee =
        body.serviceFee !== undefined
          ? parseAmount(body.serviceFee)
          : Number(current.service_fee || 0);

      const tax =
        body.taxAmount !== undefined
          ? parseAmount(body.taxAmount)
          : Number(current.tax_amount || 0);

      const total =
        body.totalAmount !== undefined
          ? parseAmount(body.totalAmount)
          : Number(current.total_amount || 0);

      if (![fee, tax, total].every(Number.isFinite)) {
        await deleteCloudinaryImages(uploaded);

        return res.status(400).json({
          success: false,
          error: "Service fee, tax, and total amount must be valid numbers",
        });
      }

      const value = (key, column) =>
        body[key] !== undefined ? body[key] : current[column];

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
          status = $22
        WHERE id = $23
        RETURNING *;
      `;

      const values = [
        value("serviceId", "service_id"),
        value("serviceName", "service_name"),
        value("jewelleryType", "jewellery_type"),
        value("issueDescription", "issue_description"),
        imageUrls,
        value("bookingDate", "booking_date"),
        value("startTime", "start_time"),
        value("endTime", "end_time"),
        value("serviceType", "service_type"),
        value("customerType", "customer_type"),
        value("fullName", "full_name"),
        value("phone", "phone"),
        value("shopName", "shop_name"),
        value("mandal", "mandal"),
        value("district", "district"),
        value("state", "state"),
        value("pincode", "pincode"),
        value("specialInstructions", "special_instructions"),
        fee,
        tax,
        total,
        value("status", "status"),
        updateid,
      ];

      const result = await pool.query(query, values);

      if (uploaded.length > 0) {
        await deleteCloudinaryImages(current.jewellery_images || []);
      }

      return res.status(200).json({
        success: true,
        message: "Gold repair booking updated successfully",
        data: result.rows[0],
      });
    } catch (error) {
      console.error("GOLD REPAIR UPDATE ERROR:", error);
      await deleteCloudinaryImages(uploaded);

      return res.status(500).json({
        success: false,
        error: error.message || "Failed to update booking",
        databaseCode: error.code || null,
        detail: error.detail || null,
      });
    }
  }
);

// DELETE /goldrepair/:id
router.delete("/:id", async (req, res) => {
  try {
    const existing = await pool.query(
      "SELECT jewellery_images FROM gold_repairs WHERE id = $1",
      [req.params.id]
    );

    if (!existing.rows.length) {
      return res.status(404).json({
        success: false,
        error: "Gold repair booking not found",
      });
    }

    await pool.query(
      "DELETE FROM gold_repairs WHERE id = $1",
      [req.params.id]
    );

    await deleteCloudinaryImages(existing.rows[0].jewellery_images || []);

    return res.status(200).json({
      success: true,
      message: "Gold repair booking deleted successfully",
    });
  } catch (error) {
    console.error("GOLD REPAIR DELETE ERROR:", error);

    return res.status(500).json({
      success: false,
      error: error.message || "Failed to delete booking",
      databaseCode: error.code || null,
    });
  }
});

module.exports = router;
