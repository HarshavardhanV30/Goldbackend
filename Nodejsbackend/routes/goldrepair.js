const express = require('express');
const router = express.Router();
const multer = require('multer');

// Root directory imports (../ resolves to /app from /app/routes)
const pool = require('../db');
const cloudinary = require('../cloudinary');

// =====================================================
// MULTER CONFIGURATION
// =====================================================

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB per file
    files: 5
  }
});

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Sanitize text input
 */
const sanitizeInput = (value, defaultValue = null) => {
  if (
    value === undefined ||
    value === null ||
    value === 'null' ||
    value === 'undefined'
  ) {
    return defaultValue;
  }

  const stringValue = String(value).trim();

  return stringValue === '' ? defaultValue : stringValue;
};

/**
 * Sanitize integer
 */
const sanitizeInteger = (value, defaultValue = null) => {
  if (
    value === undefined ||
    value === null ||
    value === '' ||
    value === 'null' ||
    value === 'undefined'
  ) {
    return defaultValue;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isNaN(parsed) ? defaultValue : parsed;
};

/**
 * Sanitize decimal/number
 */
const sanitizeNumber = (value, defaultValue = 0) => {
  if (
    value === undefined ||
    value === null ||
    value === '' ||
    value === 'null' ||
    value === 'undefined'
  ) {
    return defaultValue;
  }

  const parsed = Number.parseFloat(value);

  return Number.isNaN(parsed) ? defaultValue : parsed;
};

/**
 * Normalize images to an array
 */
const normalizeImages = (images) => {
  if (!images) {
    return [];
  }

  if (Array.isArray(images)) {
    return images.filter(Boolean);
  }

  if (typeof images === 'string') {
    try {
      const parsed = JSON.parse(images);

      if (Array.isArray(parsed)) {
        return parsed.filter(Boolean);
      }

      return parsed ? [parsed] : [];
    } catch (error) {
      return images.trim() ? [images.trim()] : [];
    }
  }

  return [];
};

/**
 * Upload image buffer to Cloudinary
 */
const uploadToCloudinary = (fileBuffer) => {
  return new Promise((resolve, reject) => {
    if (!fileBuffer) {
      return reject(new Error('Image buffer is empty'));
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'gold_repairs',
        resource_type: 'image'
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }

        if (!result || !result.secure_url) {
          return reject(
            new Error('Cloudinary upload completed without a secure URL')
          );
        }

        resolve(result.secure_url);
      }
    );

    uploadStream.end(fileBuffer);
  });
};

/**
 * Extract Cloudinary public ID from URL
 */
const getCloudinaryPublicId = (url) => {
  try {
    if (!url || typeof url !== 'string') {
      return null;
    }

    const uploadIndex = url.indexOf('/upload/');

    if (uploadIndex === -1) {
      return null;
    }

    let publicPath = url.substring(uploadIndex + '/upload/'.length);

    const segments = publicPath.split('/');

    if (segments[0].startsWith('v') && /^v\d+$/.test(segments[0])) {
      segments.shift();
    }

    publicPath = segments.join('/');

    // Remove extension
    publicPath = publicPath.replace(/\.[^/.]+$/, '');

    return publicPath || null;
  } catch (error) {
    console.error('Cloudinary public ID extraction error:', error);
    return null;
  }
};

/**
 * Delete image from Cloudinary
 */
const deleteFromCloudinary = async (url) => {
  try {
    const publicId = getCloudinaryPublicId(url);

    if (!publicId) {
      return;
    }

    await cloudinary.uploader.destroy(publicId, {
      resource_type: 'image'
    });

    console.log(`Cloudinary image deleted: ${publicId}`);
  } catch (error) {
    console.error(
      `Cloudinary delete failed for ${url}:`,
      error.message
    );
  }
};

/**
 * Delete multiple Cloudinary images
 */
const deleteImagesFromCloudinary = async (images) => {
  const normalizedImages = normalizeImages(images);

  for (const imageUrl of normalizedImages) {
    await deleteFromCloudinary(imageUrl);
  }
};

// =====================================================
// POST /goldrepair/add
// CREATE GOLD REPAIR BOOKING
// =====================================================

router.post(
  '/add',
  upload.array('jewelleryImages', 5),
  async (req, res) => {
    let uploadedImageUrls = [];

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
        totalAmount
      } = req.body;

      // Required Field Validation
      if (!serviceId) {
        return res.status(400).json({
          success: false,
          message: 'serviceId is required'
        });
      }

      if (!serviceName) {
        return res.status(400).json({
          success: false,
          message: 'serviceName is required'
        });
      }

      if (!jewelleryType) {
        return res.status(400).json({
          success: false,
          message: 'jewelleryType is required'
        });
      }

      if (!bookingDate) {
        return res.status(400).json({
          success: false,
          message: 'bookingDate is required'
        });
      }

      if (!startTime) {
        return res.status(400).json({
          success: false,
          message: 'startTime is required'
        });
      }

      if (!endTime) {
        return res.status(400).json({
          success: false,
          message: 'endTime is required'
        });
      }

      // Upload Images
      if (req.files && req.files.length > 0) {
        const uploadPromises = req.files.map((file) =>
          uploadToCloudinary(file.buffer)
        );

        uploadedImageUrls = await Promise.all(uploadPromises);
      } else if (req.body.jewelleryImages) {
        uploadedImageUrls = normalizeImages(req.body.jewelleryImages);
      }

      // Insert Record Query
      const insertQuery = `
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
          total_amount
        )
        VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9, $10,
          $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20,
          $21, $22, $23, $24
        )
        RETURNING *;
      `;

      const values = [
        sanitizeInteger(serviceId),
        sanitizeInput(serviceName),
        sanitizeInput(jewelleryType),
        sanitizeInput(issueDescription),
        uploadedImageUrls,
        sanitizeInput(bookingDate),
        sanitizeInput(startTime),
        sanitizeInput(endTime),
        sanitizeInput(serviceType, 'DOORSTEP'),
        sanitizeInput(customerType, 'SELF'),
        sanitizeInput(fullName),
        sanitizeInput(phone),
        sanitizeInput(houseNo),
        sanitizeInput(street),
        sanitizeInput(area),
        sanitizeInput(landmark),
        sanitizeInput(city),
        sanitizeInput(district),
        sanitizeInput(state),
        sanitizeInput(pincode),
        sanitizeInput(specialInstructions, ''),
        sanitizeNumber(serviceFee, 0),
        sanitizeNumber(taxAmount, 0),
        sanitizeNumber(totalAmount, 0)
      ];

      const result = await pool.query(insertQuery, values);

      return res.status(201).json({
        success: true,
        message: 'Gold repair booking created successfully',
        data: result.rows[0]
      });
    } catch (error) {
      console.error(
        'Error in POST /goldrepair/add:',
        error
      );

      // Clean up uploaded Cloudinary images if DB insert fails
      if (uploadedImageUrls.length > 0) {
        await deleteImagesFromCloudinary(uploadedImageUrls);
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to create gold repair booking',
        error: error.message
      });
    }
  }
);

// =====================================================
// GET /goldrepair/all
// GET ALL GOLD REPAIR BOOKINGS
// =====================================================

router.get('/all', async (req, res) => {
  try {
    const selectQuery = `
      SELECT *
      FROM gold_repairs
      ORDER BY created_at DESC;
    `;

    const result = await pool.query(selectQuery);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error(
      'Error in GET /goldrepair/all:',
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch gold repair bookings',
      error: error.message
    });
  }
});

// =====================================================
// GET /goldrepair/:id
// GET SINGLE GOLD REPAIR BOOKING
// =====================================================

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const repairId = sanitizeInteger(id);

    if (!repairId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid repair booking ID'
      });
    }

    const selectQuery = `
      SELECT *
      FROM gold_repairs
      WHERE id = $1;
    `;

    const result = await pool.query(selectQuery, [repairId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Repair booking not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error(
      `Error in GET /goldrepair/${req.params.id}:`,
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch repair booking',
      error: error.message
    });
  }
});

// =====================================================
// PUT /goldrepair/:id
// UPDATE GOLD REPAIR BOOKING
// =====================================================

router.put(
  '/:id',
  upload.array('jewelleryImages', 5),
  async (req, res) => {
    let newlyUploadedImages = [];

    try {
      const { id } = req.params;

      const repairId = sanitizeInteger(id);

      if (!repairId) {
        return res.status(400).json({
          success: false,
          message: 'Invalid repair booking ID'
        });
      }

      // Check Existing Record
      const checkQuery = `
        SELECT *
        FROM gold_repairs
        WHERE id = $1;
      `;

      const checkResult = await pool.query(
        checkQuery,
        [repairId]
      );

      if (checkResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Repair booking not found'
        });
      }

      const existingRecord = checkResult.rows[0];

      // Assign Form Values or Fall Back to Existing Values
      const serviceId =
        req.body.serviceId !== undefined
          ? req.body.serviceId
          : existingRecord.service_id;

      const serviceName =
        req.body.serviceName !== undefined
          ? req.body.serviceName
          : existingRecord.service_name;

      const jewelleryType =
        req.body.jewelleryType !== undefined
          ? req.body.jewelleryType
          : existingRecord.jewellery_type;

      const issueDescription =
        req.body.issueDescription !== undefined
          ? req.body.issueDescription
          : existingRecord.issue_description;

      const bookingDate =
        req.body.bookingDate !== undefined
          ? req.body.bookingDate
          : existingRecord.booking_date;

      const startTime =
        req.body.startTime !== undefined
          ? req.body.startTime
          : existingRecord.start_time;

      const endTime =
        req.body.endTime !== undefined
          ? req.body.endTime
          : existingRecord.end_time;

      const serviceType =
        req.body.serviceType !== undefined
          ? req.body.serviceType
          : existingRecord.service_type;

      const customerType =
        req.body.customerType !== undefined
          ? req.body.customerType
          : existingRecord.customer_type;

      const fullName =
        req.body.fullName !== undefined
          ? req.body.fullName
          : existingRecord.full_name;

      const phone =
        req.body.phone !== undefined
          ? req.body.phone
          : existingRecord.phone;

      const houseNo =
        req.body.houseNo !== undefined
          ? req.body.houseNo
          : existingRecord.house_no;

      const street =
        req.body.street !== undefined
          ? req.body.street
          : existingRecord.street;

      const area =
        req.body.area !== undefined
          ? req.body.area
          : existingRecord.area;

      const landmark =
        req.body.landmark !== undefined
          ? req.body.landmark
          : existingRecord.landmark;

      const city =
        req.body.city !== undefined
          ? req.body.city
          : existingRecord.city;

      const district =
        req.body.district !== undefined
          ? req.body.district
          : existingRecord.district;

      const state =
        req.body.state !== undefined
          ? req.body.state
          : existingRecord.state;

      const pincode =
        req.body.pincode !== undefined
          ? req.body.pincode
          : existingRecord.pincode;

      const specialInstructions =
        req.body.specialInstructions !== undefined
          ? req.body.specialInstructions
          : existingRecord.special_instructions;

      const serviceFee =
        req.body.serviceFee !== undefined
          ? req.body.serviceFee
          : existingRecord.service_fee;

      const taxAmount =
        req.body.taxAmount !== undefined
          ? req.body.taxAmount
          : existingRecord.tax_amount;

      const totalAmount =
        req.body.totalAmount !== undefined
          ? req.body.totalAmount
          : existingRecord.total_amount;

      // Retain Existing Images
      let imageUrls = normalizeImages(
        existingRecord.jewellery_images
      );

      // Handle New File Uploads
      if (req.files && req.files.length > 0) {
        const uploadPromises = req.files.map((file) =>
          uploadToCloudinary(file.buffer)
        );

        newlyUploadedImages = await Promise.all(
          uploadPromises
        );

        imageUrls = [
          ...imageUrls,
          ...newlyUploadedImages
        ];
      }

      // Update Query
      const updateQuery = `
        UPDATE gold_repairs
        SET
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
          house_no = $13,
          street = $14,
          area = $15,
          landmark = $16,
          city = $17,
          district = $18,
          state = $19,
          pincode = $20,
          special_instructions = $21,
          service_fee = $22,
          tax_amount = $23,
          total_amount = $24,
          updated_at = NOW()
        WHERE id = $25
        RETURNING *;
      `;

      const values = [
        sanitizeInteger(serviceId),
        sanitizeInput(serviceName),
        sanitizeInput(jewelleryType),
        sanitizeInput(issueDescription),
        imageUrls,
        sanitizeInput(bookingDate),
        sanitizeInput(startTime),
        sanitizeInput(endTime),
        sanitizeInput(serviceType, 'DOORSTEP'),
        sanitizeInput(customerType, 'SELF'),
        sanitizeInput(fullName),
        sanitizeInput(phone),
        sanitizeInput(houseNo),
        sanitizeInput(street),
        sanitizeInput(area),
        sanitizeInput(landmark),
        sanitizeInput(city),
        sanitizeInput(district),
        sanitizeInput(state),
        sanitizeInput(pincode),
        sanitizeInput(specialInstructions, ''),
        sanitizeNumber(
          serviceFee,
          Number(existingRecord.service_fee) || 0
        ),
        sanitizeNumber(
          taxAmount,
          Number(existingRecord.tax_amount) || 0
        ),
        sanitizeNumber(
          totalAmount,
          Number(existingRecord.total_amount) || 0
        ),
        repairId
      ];

      const result = await pool.query(
        updateQuery,
        values
      );

      return res.status(200).json({
        success: true,
        message: 'Gold repair booking updated successfully',
        data: result.rows[0]
      });
    } catch (error) {
      console.error(
        `Error in PUT /goldrepair/${req.params.id}:`,
        error
      );

      // Clean up newly uploaded images if update failed
      if (newlyUploadedImages.length > 0) {
        await deleteImagesFromCloudinary(
          newlyUploadedImages
        );
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to update gold repair booking',
        error: error.message
      });
    }
  }
);

// =====================================================
// DELETE /goldrepair/:id
// DELETE GOLD REPAIR BOOKING
// =====================================================

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const repairId = sanitizeInteger(id);

    if (!repairId) {
      return res.status(400).json({
        success: false,
        message: 'Invalid repair booking ID'
      });
    }

    // Check Existing Record
    const selectQuery = `
      SELECT *
      FROM gold_repairs
      WHERE id = $1;
    `;

    const checkResult = await pool.query(
      selectQuery,
      [repairId]
    );

    if (checkResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Repair booking not found'
      });
    }

    const record = checkResult.rows[0];

    // Delete Record from Database
    const deleteQuery = `
      DELETE FROM gold_repairs
      WHERE id = $1
      RETURNING *;
    `;

    const deleteResult = await pool.query(
      deleteQuery,
      [repairId]
    );

    // Delete Images from Cloudinary
    const images = normalizeImages(
      record.jewellery_images
    );

    if (images.length > 0) {
      await deleteImagesFromCloudinary(images);
    }

    return res.status(200).json({
      success: true,
      message:
        'Gold repair booking and associated images deleted successfully',
      data: deleteResult.rows[0]
    });
  } catch (error) {
    console.error(
      `Error in DELETE /goldrepair/${req.params.id}:`,
      error
    );

    return res.status(500).json({
      success: false,
      message: 'Failed to delete gold repair booking',
      error: error.message
    });
  }
});

// =====================================================
// EXPORT ROUTER
// =====================================================

module.exports = router;
