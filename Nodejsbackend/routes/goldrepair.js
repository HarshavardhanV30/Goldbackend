/**
 * goldrepair.js
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('./db');
const cloudinary = require('./cloudinary');

// Multer in-memory storage (max 10MB per image)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Helper: Cloudinary direct stream upload
const uploadToCloudinary = (fileBuffer) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: 'gold_repairs' },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    uploadStream.end(fileBuffer);
  });
};

// Helper: Extract Cloudinary Public ID
const getCloudinaryPublicId = (url) => {
  try {
    if (!url || typeof url !== 'string') return null;
    const parts = url.split('/');
    const folder = parts[parts.length - 2];
    const fileNameWithExt = parts[parts.length - 1];
    const fileName = fileNameWithExt.split('.')[0];
    return `${folder}/${fileName}`;
  } catch (err) {
    return null;
  }
};

// Sanitization Helpers
const sanitizeInput = (val) => {
  if (val === undefined || val === null || val === 'null' || val === 'undefined') {
    return null;
  }
  const strVal = String(val).trim();
  return strVal === '' ? null : strVal;
};

const sanitizeNumber = (val, defaultValue = 0) => {
  if (val === undefined || val === null || val === '') return defaultValue;
  const parsed = parseFloat(val);
  return isNaN(parsed) ? defaultValue : parsed;
};

// ==========================================
// API ENDPOINTS
// ==========================================

/**
 * @route   POST /goldrepair/add
 * @desc    Create a new gold repair booking
 */
router.post('/add', upload.array('jewelleryImages', 5), async (req, res, next) => {
  try {
    const {
      serviceId,
      serviceName,
      jewelleryType,
      issueDescription,
      bookingDate,
      startTime,
      endTime,
      serviceType = 'DOORSTEP',
      customerType = 'SELF',
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
      specialInstructions = '',
      serviceFee,
      taxAmount,
      totalAmount
    } = req.body;

    // Process uploaded images
    let imageUrls = [];
    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map(file => uploadToCloudinary(file.buffer));
      imageUrls = await Promise.all(uploadPromises);
    } else if (req.body.jewelleryImages) {
      if (typeof req.body.jewelleryImages === 'string') {
        try {
          imageUrls = JSON.parse(req.body.jewelleryImages);
        } catch (e) {
          if (!req.body.jewelleryImages.startsWith('(')) {
            imageUrls = [req.body.jewelleryImages];
          }
        }
      } else if (Array.isArray(req.body.jewelleryImages)) {
        imageUrls = req.body.jewelleryImages;
      }
    }

    const insertQuery = `
      INSERT INTO gold_repairs (
        service_id, service_name, jewellery_type, issue_description,
        jewellery_images, booking_date, start_time, end_time, service_type,
        customer_type, full_name, phone, house_no, street, area, 
        landmark, city, district, state, pincode,
        special_instructions, service_fee, tax_amount, total_amount
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24
      )
      RETURNING *;
    `;

    const values = [
      sanitizeInput(serviceId),
      sanitizeInput(serviceName),
      sanitizeInput(jewelleryType),
      sanitizeInput(issueDescription),
      imageUrls,
      sanitizeInput(bookingDate),
      sanitizeInput(startTime),
      sanitizeInput(endTime),
      sanitizeInput(serviceType) || 'DOORSTEP',
      sanitizeInput(customerType) || 'SELF',
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
      sanitizeInput(specialInstructions) || '',
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
    next(error);
  }
});

/**
 * @route   GET /goldrepair/all
 * @desc    Get all gold repair bookings
 */
router.get('/all', async (req, res, next) => {
  try {
    const selectQuery = 'SELECT * FROM gold_repairs ORDER BY created_at DESC;';
    const result = await pool.query(selectQuery);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   GET /goldrepair/:id
 * @desc    Get gold repair booking by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const selectQuery = 'SELECT * FROM gold_repairs WHERE id = $1;';
    const result = await pool.query(selectQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   PUT /goldrepair/:id
 * @desc    Update gold repair booking by ID
 */
router.put('/:id', upload.array('jewelleryImages', 5), async (req, res, next) => {
  try {
    const { id } = req.params;

    const checkQuery = 'SELECT * FROM gold_repairs WHERE id = $1;';
    const checkResult = await pool.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const existing = checkResult.rows[0];

    const {
      serviceId = existing.service_id,
      serviceName = existing.service_name,
      jewelleryType = existing.jewellery_type,
      issueDescription = existing.issue_description,
      bookingDate = existing.booking_date,
      startTime = existing.start_time,
      endTime = existing.end_time,
      serviceType = existing.service_type,
      customerType = existing.customer_type,
      fullName = existing.full_name,
      phone = existing.phone,
      houseNo = existing.house_no,
      street = existing.street,
      area = existing.area,
      landmark = existing.landmark,
      city = existing.city,
      district = existing.district,
      state = existing.state,
      pincode = existing.pincode,
      specialInstructions = existing.special_instructions,
      serviceFee = existing.service_fee,
      taxAmount = existing.tax_amount,
      totalAmount = existing.total_amount
    } = req.body;

    let imageUrls = existing.jewellery_images || [];
    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map(file => uploadToCloudinary(file.buffer));
      const newUrls = await Promise.all(uploadPromises);
      imageUrls = [...imageUrls, ...newUrls];
    }

    const updateQuery = `
      UPDATE gold_repairs
      SET 
        service_id = $1, service_name = $2, jewellery_type = $3, issue_description = $4,
        jewellery_images = $5, booking_date = $6, start_time = $7, end_time = $8,
        service_type = $9, customer_type = $10, full_name = $11, phone = $12,
        house_no = $13, street = $14, area = $15, landmark = $16, city = $17,
        district = $18, state = $19, pincode = $20, special_instructions = $21,
        service_fee = $22, tax_amount = $23, total_amount = $24, updated_at = NOW()
      WHERE id = $25
      RETURNING *;
    `;

    const values = [
      sanitizeInput(serviceId),
      sanitizeInput(serviceName),
      sanitizeInput(jewelleryType),
      sanitizeInput(issueDescription),
      imageUrls,
      sanitizeInput(bookingDate),
      sanitizeInput(startTime),
      sanitizeInput(endTime),
      sanitizeInput(serviceType),
      sanitizeInput(customerType),
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
      sanitizeInput(specialInstructions),
      sanitizeNumber(serviceFee, existing.service_fee),
      sanitizeNumber(taxAmount, existing.tax_amount),
      sanitizeNumber(totalAmount, existing.total_amount),
      id
    ];

    const result = await pool.query(updateQuery, values);

    return res.status(200).json({
      success: true,
      message: 'Booking updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   DELETE /goldrepair/:id
 * @desc    Delete gold repair booking by ID
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const checkQuery = 'SELECT * FROM gold_repairs WHERE id = $1;';
    const checkResult = await pool.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    const record = checkResult.rows[0];

    if (record.jewellery_images && Array.isArray(record.jewellery_images)) {
      for (const imgUrl of record.jewellery_images) {
        const publicId = getCloudinaryPublicId(imgUrl);
        if (publicId) {
          try {
            await cloudinary.uploader.destroy(publicId);
          } catch (cloudErr) {
            console.error('Cloudinary deletion failed:', cloudErr.message);
          }
        }
      }
    }

    await pool.query('DELETE FROM gold_repairs WHERE id = $1;', [id]);

    return res.status(200).json({
      success: true,
      message: 'Booking deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
