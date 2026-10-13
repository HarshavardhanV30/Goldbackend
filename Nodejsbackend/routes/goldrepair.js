const express = require("express");
const multer = require("multer");
const cloudinary = require("../cloudinary");
const pool = require("../db");
const { randomUUID } = require("crypto");

const router = express.Router();

const MAX_IMAGES = 10;
const MAX_FILE_SIZE = 8 * 1024 * 1024;

const allowedMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
];

// ========================================
// MULTER: KEEP IMAGE FILES IN MEMORY
// ========================================
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_IMAGES,
  },
  fileFilter: (req, file, callback) => {
    if (!allowedMimeTypes.includes(file.mimetype)) {
      return callback(
        new Error("Only JPG, PNG, WEBP and GIF images are allowed.")
      );
    }

    callback(null, true);
  },
});

function uploadJewelleryImages(req, res, next) {
  upload.array("jewelleryImages", MAX_IMAGES)(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    next();
  });
}

// ========================================
// CLOUDINARY IMAGE UPLOAD
// ========================================
function uploadToCloudinary(file) {
  return new Promise((resolve, reject) => {
    const publicId = `gold-repair-${randomUUID()}`;

    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "gold_repairs",
        public_id: publicId,
        resource_type: "image",
      },
      (error, result) => {
        if (error) {
          console.error("CLOUDINARY UPLOAD ERROR:", {
            message: error.message,
            http_code: error.http_code,
            filename: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
          });

          return reject(error);
        }

        if (!result?.secure_url || !result?.public_id) {
          return reject(new Error("Cloudinary returned no image URL."));
        }

        resolve({
          url: result.secure_url,
          publicId: result.public_id,
        });
      }
    );

    stream.on("error", reject);
    stream.end(file.buffer);
  });
}

async function uploadAllImages(files = []) {
  const uploaded = [];

  try {
    for (const file of files) {
      uploaded.push(await uploadToCloudinary(file));
    }

    return uploaded;
  } catch (error) {
    // Clean up images uploaded before a later image failed.
    await Promise.allSettled(
      uploaded.map((image) =>
        cloudinary.uploader.destroy(image.publicId)
      )
    );

    throw error;
  }
}

// ========================================
// IMAGE HELPERS
// ========================================
function parseImageInput(input) {
  if (!input) return [];

  if (Array.isArray(input)) return input;

  if (typeof input !== "string") return [];

  try {
    const parsed = JSON.parse(input);
    return Array.isArray(parsed) ? parsed : [input];
  } catch {
    return [input];
  }
}

function validImageUrls(input) {
  return [
    ...new Set(
      parseImageInput(input).filter(
        (url) =>
          typeof url === "string" &&
          /^https:\/\/res\.cloudinary\.com\//i.test(url)
      )
    ),
  ];
}

function getCloudinaryPublicId(url) {
  try {
    const parsed = new URL(url);

    if (!parsed.hostname.endsWith("cloudinary.com")) {
      return null;
    }

    const parts = parsed.pathname.split("/").filter(Boolean);
    const uploadIndex = parts.indexOf("upload");

    if (uploadIndex === -1) return null;

    // Remove "upload", optional transformations and version number.
    let imageParts = parts.slice(uploadIndex + 1);

    if (imageParts[0]?.startsWith("v") && /^v\d+$/.test(imageParts[0])) {
      imageParts = imageParts.slice(1);
    } else {
      const versionIndex = imageParts.findIndex((part) =>
        /^v\d+$/.test(part)
      );

      if (versionIndex !== -1) {
        imageParts = imageParts.slice(versionIndex + 1);
      }
    }

    if (!imageParts.length) return null;

    const last = imageParts[imageParts.length - 1];
    imageParts[imageParts.length - 1] = last.replace(/\.[^.]+$/, "");

    return imageParts.join("/");
  } catch {
    return null;
  }
}

async function deleteCloudinaryImages(urls = []) {
  const uniqueUrls = [...new Set(Array.isArray(urls) ? urls : [])];

  for (const url of uniqueUrls) {
    const publicId = getCloudinaryPublicId(url);

    if (!publicId) continue;

    try {
      await cloudinary.uploader.destroy(publicId, {
        resource_type: "image",
      });
    } catch (error) {
      console.error("CLOUDINARY DELETE ERROR:", error.message);
    }
  }
}

function numberOrDefault(value, fallback = 0) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    throw new Error(`Invalid numeric value: ${value}`);
  }

  return number;
}

function getValue(body, key, databaseValue, fallback = null) {
  return body[key] !== undefined ? body[key] : databaseValue ?? fallback;
}

// ========================================
// POST: CREATE BOOKING
// POST /goldrepair/add
// ========================================
router.post("/add", uploadJewelleryImages, async (req, res) => {
  let uploadedImages = [];

  try {
    const body = req.body;

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
      houseNo,
      street,
      area,
      landmark,
      mandal,
      district,
      city,
      state,
      pincode,
      specialInstructions,
      status,
    } = body;

    if (!serviceName || !fullName || !phone) {
      return res.status(400).json({
        success: false,
        error: "serviceName, fullName and phone are required.",
      });
    }

    uploadedImages = await uploadAllImages(req.files || []);

    const extraUrls = validImageUrls(body.existingJewelleryImages);
    const imageUrls = [
      ...new Set([...uploadedImages.map((image) => image.url), ...extraUrls]),
    ];

    const serviceFee = numberOrDefault(body.serviceFee);
    const taxAmount = numberOrDefault(body.taxAmount);
    const totalAmount =
      body.totalAmount !== undefined && body.totalAmount !== ""
        ? numberOrDefault(body.totalAmount)
        : serviceFee + taxAmount;

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
        house_no,
        street,
        area,
        landmark,
        mandal,
        district,
        city,
        state,
        pincode,
        special_instructions,
        service_fee,
        tax_amount,
        total_amount,
        status
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14, $15, $16, $17,
        $18, $19, $20, $21, $22, $23, $24, $25,
        $26, $27
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
      houseNo || null,
      street || null,
      area || null,
      landmark || null,
      mandal || null,
      district || null,
      city || null,
      state || null,
      pincode || null,
      specialInstructions || null,
      serviceFee,
      taxAmount,
      totalAmount,
      status || "pending",
    ];

    const result = await pool.query(query, values);

    return res.status(201).json({
      success: true,
      message: "Gold repair booking created successfully",
      data: result.rows[0],
    });
  } catch (error) {
    // If the database insert fails, remove the newly uploaded images.
    await deleteCloudinaryImages(
      uploadedImages.map((image) => image.url)
    );

    console.error("GOLD REPAIR CREATE ERROR:", error);

    return res.status(500).json({
      success: false,
      error: "Failed to create gold repair booking.",
      detail: error.message,
      databaseCode: error.code || null,
    });
  }
});

// ========================================
// GET: ALL BOOKINGS
// GET /goldrepair/all
// ========================================
router.get(["/all", "/repairall"], async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM gold_repairs ORDER BY id DESC"
    );

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows,
    });
  } catch (error) {
    console.error("GOLD REPAIR LIST ERROR:", error.message);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch gold repair bookings.",
    });
  }
});

// ========================================
// GET: ONE BOOKING
// GET /goldrepair/:id
// ========================================
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!/^\d+$/.test(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid booking ID.",
      });
    }

    const result = await pool.query(
      "SELECT * FROM gold_repairs WHERE id = $1",
      [id]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        error: "Gold repair booking not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    console.error("GOLD REPAIR GET ERROR:", error.message);

    return res.status(500).json({
      success: false,
      error: "Failed to fetch gold repair booking.",
    });
  }
});

// ========================================
// PUT: UPDATE BOOKING
// PUT /goldrepair/update/:updateid
// ========================================
router.put(
  "/update/:updateid",
  uploadJewelleryImages,
  async (req, res) => {
    let newlyUploadedImages = [];

    try {
      const { updateid } = req.params;

      if (!/^\d+$/.test(updateid)) {
        return res.status(400).json({
          success: false,
          error: "Invalid booking ID.",
        });
      }

      const check = await pool.query(
        "SELECT * FROM gold_repairs WHERE id = $1",
        [updateid]
      );

      if (!check.rowCount) {
        return res.status(404).json({
          success: false,
          error: "Gold repair booking not found.",
        });
      }

      const current = check.rows[0];
      const body = req.body;

      // Upload new images first; keep existing images if no new files are sent.
      newlyUploadedImages = await uploadAllImages(req.files || []);

      let imageUrls = current.jewellery_images || [];

      if (newlyUploadedImages.length) {
        imageUrls = newlyUploadedImages.map((image) => image.url);
      } else if (body.existingJewelleryImages !== undefined) {
        imageUrls = validImageUrls(body.existingJewelleryImages);
      } else if (body.jewelleryImages !== undefined) {
        imageUrls = validImageUrls(body.jewelleryImages);
      }

      const serviceFee =
        body.serviceFee !== undefined
          ? numberOrDefault(body.serviceFee)
          : Number(current.service_fee || 0);

      const taxAmount =
        body.taxAmount !== undefined
          ? numberOrDefault(body.taxAmount)
          : Number(current.tax_amount || 0);

      const totalAmount =
        body.totalAmount !== undefined
          ? numberOrDefault(body.totalAmount)
          : serviceFee + taxAmount;

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
          house_no = $14,
          street = $15,
          area = $16,
          landmark = $17,
          mandal = $18,
          district = $19,
          city = $20,
          state = $21,
          pincode = $22,
          special_instructions = $23,
          service_fee = $24,
          tax_amount = $25,
          total_amount = $26,
          status = $27,
          updated_at = NOW()
        WHERE id = $28
        RETURNING *;
      `;

      const values = [
        getValue(body, "serviceId", current.service_id),
        getValue(body, "serviceName", current.service_name),
        getValue(body, "jewelleryType", current.jewellery_type),
        getValue(body, "issueDescription", current.issue_description),
        imageUrls,
        getValue(body, "bookingDate", current.booking_date),
        getValue(body, "startTime", current.start_time),
        getValue(body, "endTime", current.end_time),
        getValue(body, "serviceType", current.service_type),
        getValue(body, "customerType", current.customer_type),
        getValue(body, "fullName", current.full_name),
        getValue(body, "phone", current.phone),
        getValue(body, "shopName", current.shop_name),
        getValue(body, "houseNo", current.house_no),
        getValue(body, "street", current.street),
        getValue(body, "area", current.area),
        getValue(body, "landmark", current.landmark),
        getValue(body, "mandal", current.mandal),
        getValue(body, "district", current.district),
        getValue(body, "city", current.city),
        getValue(body, "state", current.state),
        getValue(body, "pincode", current.pincode),
        getValue(body, "specialInstructions", current.special_instructions),
        serviceFee,
        taxAmount,
        totalAmount,
        getValue(body, "status", current.status),
        updateid,
      ];

      const result = await pool.query(query, values);

      // Delete replaced images only after the database update succeeds.
      if (newlyUploadedImages.length) {
        await deleteCloudinaryImages(current.jewellery_images || []);
      } else if (
        body.existingJewelleryImages !== undefined ||
        body.jewelleryImages !== undefined
      ) {
        const retained = new Set(imageUrls);
        const removed = (current.jewellery_images || []).filter(
          (url) => !retained.has(url)
        );

        await deleteCloudinaryImages(removed);
      }

      return res.status(200).json({
        success: true,
        message: "Gold repair booking updated successfully",
        data: result.rows[0],
      });
    } catch (error) {
      await deleteCloudinaryImages(
        newlyUploadedImages.map((image) => image.url)
      );

      console.error("GOLD REPAIR UPDATE ERROR:", error);

      return res.status(500).json({
        success: false,
        error: "Failed to update gold repair booking.",
        detail: error.message,
        databaseCode: error.code || null,
      });
    }
  }
);

// ========================================
// DELETE: BOOKING
// DELETE /goldrepair/:id
// ========================================
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!/^\d+$/.test(id)) {
      return res.status(400).json({
        success: false,
        error: "Invalid booking ID.",
      });
    }

    const result = await pool.query(
      "DELETE FROM gold_repairs WHERE id = $1 RETURNING *",
      [id]
    );

    if (!result.rowCount) {
      return res.status(404).json({
        success: false,
        error: "Gold repair booking not found.",
      });
    }

    // The database record is deleted first. Image cleanup errors are logged.
    await deleteCloudinaryImages(result.rows[0].jewellery_images || []);

    return res.status(200).json({
      success: true,
      message: "Gold repair booking deleted successfully.",
    });
  } catch (error) {
    console.error("GOLD REPAIR DELETE ERROR:", error.message);

    return res.status(500).json({
      success: false,
      error: "Failed to delete gold repair booking.",
    });
  }
});

// ========================================
// MULTER / UPLOAD ERROR HANDLER
// ========================================
router.use((error, req, res, next) => {
  console.error("GOLD REPAIR ROUTE ERROR:", error.message);

  if (res.headersSent) return next(error);

  return res.status(400).json({
    success: false,
    error: error.message || "Invalid request.",
  });
});

module.exports = router;
