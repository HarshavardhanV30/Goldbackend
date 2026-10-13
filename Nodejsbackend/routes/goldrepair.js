const express = require("express");
const multer = require("multer");
const cloudinary = require("../cloudinary");
const pool = require("../db");
const { randomUUID } = require("crypto");

const router = express.Router();

// ============================================
// CONFIGURATION
// ============================================
const MAX_IMAGES = 10;
const MAX_FILE_SIZE = 8 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_IMAGES,
  },
  fileFilter: (req, file, cb) => {
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ];

    if (!allowed.includes(file.mimetype)) {
      return cb(
        new Error(
          `Unsupported image type: ${file.mimetype}. Upload JPG, PNG, WEBP or GIF.`
        )
      );
    }

    cb(null, true);
  },
});

function uploadJewelleryImages(req, res, next) {
  upload.array("jewelleryImages", MAX_IMAGES)(req, res, (err) => {
    if (err) {
      return res.status(400).json({
        success: false,
        error: err.message,
      });
    }

    next();
  });
}

// ============================================
// VALIDATE ACTUAL IMAGE CONTENT
// Checks file signature, not just filename/MIME.
// ============================================
function detectImageType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) {
    return null;
  }

  // JPEG
  if (
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return "image/jpeg";
  }

  // PNG
  if (
    buffer.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
    )
  ) {
    return "image/png";
  }

  // GIF
  const gifHeader = buffer.subarray(0, 6).toString("ascii");
  if (gifHeader === "GIF87a" || gifHeader === "GIF89a") {
    return "image/gif";
  }

  // WEBP
  if (
    buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
    buffer.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return "image/webp";
  }

  return null;
}

// ============================================
// CLOUDINARY UPLOAD
// ============================================
function uploadToCloudinary(file) {
  return new Promise((resolve, reject) => {
    if (!file || !Buffer.isBuffer(file.buffer) || !file.buffer.length) {
      return reject(new Error("Image file is empty or missing."));
    }

    const detectedType = detectImageType(file.buffer);

    if (!detectedType) {
      return reject(
        new Error(
          `Invalid image file: ${file.originalname}. ` +
          "The file content is not a supported JPG, PNG, WEBP or GIF image. " +
          "Choose a real image file instead of a filename, URL or renamed document."
        )
      );
    }

    // Prevent MIME type and actual file content from disagreeing.
    if (file.mimetype !== detectedType) {
      return reject(
        new Error(
          `Image format mismatch for ${file.originalname}. ` +
          `Detected ${detectedType}, received ${file.mimetype}.`
        )
      );
    }

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

          return reject(
            new Error(
              `Cloudinary upload failed: ${error.message || "Unknown error"}`
            )
          );
        }

        if (!result || !result.secure_url || !result.public_id) {
          return reject(
            new Error("Cloudinary did not return a valid image URL.")
          );
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
      const image = await uploadToCloudinary(file);
      uploaded.push(image);
    }

    return uploaded;
  } catch (error) {
    await Promise.allSettled(
      uploaded.map((image) =>
        cloudinary.uploader.destroy(image.publicId, {
          resource_type: "image",
        })
      )
    );

    throw error;
  }
}

// ============================================
// IMAGE HELPERS
// ============================================
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

    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname.endsWith("cloudinary.com")
    ) {
      return null;
    }

    const parts = parsed.pathname.split("/").filter(Boolean);
    const uploadIndex = parts.indexOf("upload");

    if (uploadIndex < 0) return null;

    let imageParts = parts.slice(uploadIndex + 1);

    // Skip optional transformation segments until a version segment.
    const versionIndex = imageParts.findIndex((part) =>
      /^v\d+$/.test(part)
    );

    if (versionIndex >= 0) {
      imageParts = imageParts.slice(versionIndex + 1);
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
  for (const url of new Set(Array.isArray(urls) ? urls : [])) {
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

// ============================================
// GENERAL HELPERS
// ============================================
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

function getValue(body, key, databaseValue) {
  return body[key] !== undefined ? body[key] : databaseValue;
}

function validId(id) {
  return /^\d+$/.test(String(id));
}

// ============================================
// POST /goldrepair/add
// CREATE BOOKING
// ============================================
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

    if (!/^\d{10}$/.test(String(phone).replace(/\s+/g, ""))) {
      return res.status(400).json({
        success: false,
        error: "Enter a valid 10-digit phone number.",
      });
    }

    console.log("Gold repair request:", {
      serviceName,
      imageCount: (req.files || []).length,
      files: (req.files || []).map((file) => ({
        name: file.originalname,
        type: file.mimetype,
        size: file.size,
        bufferLength: file.buffer?.length || 0,
      })),
    });

    // Upload all images to Cloudinary before inserting the booking.
    uploadedImages = await uploadAllImages(req.files || []);

    const extraUrls = validImageUrls(body.existingJewelleryImages);
    const imageUrls = [
      ...new Set([
        ...uploadedImages.map((image) => image.url),
        ...extraUrls,
      ]),
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
      String(phone).replace(/\s+/g, ""),
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
      message: "Gold repair booking created successfully.",
      data: result.rows[0],
    });
  } catch (error) {
    // Remove newly uploaded images if the booking insert fails.
    await Promise.allSettled(
      uploadedImages.map((image) =>
        cloudinary.uploader.destroy(image.publicId, {
          resource_type: "image",
        })
      )
    );

    console.error("GOLD REPAIR CREATE ERROR:", {
      message: error.message,
      code: error.code || null,
      stack: error.stack,
    });

    return res.status(error.code ? 500 : 400).json({
      success: false,
      error: "Failed to create gold repair booking.",
      detail: error.message,
      databaseCode: error.code || null,
    });
  }
});

// ============================================
// GET /goldrepair/all
// GET ALL BOOKINGS
// ============================================
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

// ============================================
// GET /goldrepair/:id
// GET ONE BOOKING
// ============================================
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!validId(id)) {
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

// ============================================
// PUT /goldrepair/update/:updateid
// UPDATE BOOKING
// ============================================
router.put(
  "/update/:updateid",
  uploadJewelleryImages,
  async (req, res) => {
    let newlyUploadedImages = [];

    try {
      const { updateid } = req.params;

      if (!validId(updateid)) {
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

      // Only remove old images after the database update succeeds.
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
        message: "Gold repair booking updated successfully.",
        data: result.rows[0],
      });
    } catch (error) {
      await Promise.allSettled(
        newlyUploadedImages.map((image) =>
          cloudinary.uploader.destroy(image.publicId, {
            resource_type: "image",
          })
        )
      );

      console.error("GOLD REPAIR UPDATE ERROR:", error.message);

      return res.status(error.code ? 500 : 400).json({
        success: false,
        error: "Failed to update gold repair booking.",
        detail: error.message,
        databaseCode: error.code || null,
      });
    }
  }
);

// ============================================
// DELETE /goldrepair/:id
// DELETE BOOKING
// ============================================
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!validId(id)) {
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

module.exports = router;
