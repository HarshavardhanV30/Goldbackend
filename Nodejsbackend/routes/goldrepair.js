const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('../db'); // Updated path from ./db to ../db
const cloudinary = require('../cloudinary'); // Updated path from ./cloudinary to ../cloudinary

// Configured multer memory storage for direct Cloudinary stream upload
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10 MB limit
});

// Helper function to stream buffer upload to Cloudinary
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

// Helper function to extract Cloudinary public ID from URL for deletion
const getCloudinaryPublicId = (url) => {
  try {
    if (!url) return null;
    const parts = url.split('/');
    const folder = parts[parts.length - 2];
    const fileNameWithExt = parts[parts.length - 1];
    const fileName = fileNameWithExt.split('.')[0];
    return `${folder}/${fileName}`;
  } catch (err) {
    return null;
  }
};

// Helper function to sanitize text input from form-data
const sanitizeInput = (val) => {
  if (val === undefined || val === null || val === 'null' || val === 'undefined') {
    return null;
  }
  const strVal = String(val).trim();
  return strVal === '' ? null : strVal;
};

// Helper function to sanitize numeric input from form-data
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
 * @access  Public
 */
router.post('/add', upload.array('jewelleryImages', 5), async (req, res) => {
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

    let imageUrls = [];
    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map(file => uploadToCloudinary(file.buffer));
      imageUrls = await Promise.all(uploadPromises);
    } else if (req.body.jewelleryImages) {
      if (typeof req.body.jewelleryImages === 'string') {
        try {
          imageUrls = JSON.parse(req.body.jewelleryImages);
        } catch (e) {
          imageUrls = [req.body.jewelleryImages];
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
    console.error('Error in POST /goldrepair/add:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /goldrepair/all
 * @desc    Get all gold repair bookings
 * @access  Public
 */
router.get('/all', async (req, res) => {
  try {
    const selectQuery = 'SELECT * FROM gold_repairs ORDER BY created_at DESC;';
    const result = await pool.query(selectQuery);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    console.error('Error in GET /goldrepair/all:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /goldrepair/:id
 * @desc    Get gold repair booking by ID
 * @access  Public
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const selectQuery = 'SELECT * FROM gold_repairs WHERE id = $1;';
    const result = await pool.query(selectQuery, [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Repair booking not found' });
    }

    return res.status(200).json({
      success: true,
      data: result.rows[0]
    });
  } catch (error) {
    console.error(`Error in GET /goldrepair/${req.params.id}:`, error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   PUT /goldrepair/:id
 * @desc    Update gold repair booking by ID
 * @access  Public
 */
router.put('/:id', upload.array('jewelleryImages', 5), async (req, res) => {
  try {
    const { id } = req.params;

    const checkQuery = 'SELECT * FROM gold_repairs WHERE id = $1;';
    const checkResult = await pool.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Repair booking not found' });
    }

    const existingRecord = checkResult.rows[0];

    const {
      serviceId = existingRecord.service_id,
      serviceName = existingRecord.service_name,
      jewelleryType = existingRecord.jewellery_type,
      issueDescription = existingRecord.issue_description,
      bookingDate = existingRecord.booking_date,
      startTime = existingRecord.start_time,
      endTime = existingRecord.end_time,
      serviceType = existingRecord.service_type,
      customerType = existingRecord.customer_type,
      fullName = existingRecord.full_name,
      phone = existingRecord.phone,
      houseNo = existingRecord.house_no,
      street = existingRecord.street,
      area = existingRecord.area,
      landmark = existingRecord.landmark,
      city = existingRecord.city,
      district = existingRecord.district,
      state = existingRecord.state,
      pincode = existingRecord.pincode,
      specialInstructions = existingRecord.special_instructions,
      serviceFee = existingRecord.service_fee,
      taxAmount = existingRecord.tax_amount,
      totalAmount = existingRecord.total_amount
    } = req.body;

    let imageUrls = existingRecord.jewellery_images || [];
    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map(file => uploadToCloudinary(file.buffer));
      const newUrls = await Promise.all(uploadPromises);
      imageUrls = [...imageUrls, ...newUrls];
    }

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
      sanitizeNumber(serviceFee, existingRecord.service_fee),
      sanitizeNumber(taxAmount, existingRecord.tax_amount),
      sanitizeNumber(totalAmount, existingRecord.total_amount),
      id
    ];

    const result = await pool.query(updateQuery, values);

    return res.status(200).json({
      success: true,
      message: 'Gold repair booking updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    console.error(`Error in PUT /goldrepair/${req.params.id}:`, error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   DELETE /goldrepair/:id
 * @desc    Delete gold repair booking by ID (removes Cloudinary images)
 * @access  Public
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const selectQuery = 'SELECT * FROM gold_repairs WHERE id = $1;';
    const checkResult = await pool.query(selectQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Repair booking not found' });
    }

    const record = checkResult.rows[0];

    if (record.jewellery_images && record.jewellery_images.length > 0) {
      for (const imgUrl of record.jewellery_images) {
        const publicId = getCloudinaryPublicId(imgUrl);
        if (publicId) {
          try {
            await cloudinary.uploader.destroy(publicId);
          } catch (cloudErr) {
            console.error(`Failed to delete Cloudinary asset (${publicId}):`, cloudErr.message);
          }
        }
      }
    }

    const deleteQuery = 'DELETE FROM gold_repairs WHERE id = $1;';
    await pool.query(deleteQuery, [id]);

    return res.status(200).json({
      success: true,
      message: 'Gold repair booking and associated images deleted successfully'
    });
  } catch (error) {
    console.error(`Error in DELETE /goldrepair/${req.params.id}:`, error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
