/**
 * goldrepair.js
 * 
 * Required NPM packages:
 * npm install express pg multer cloudinary dotenv
 */

const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('./db'); // Imports your pg pool connection
const cloudinary = require('./cloudinary'); // Imports your configured Cloudinary instance

// Configured multer memory storage for direct Cloudinary stream upload
const upload = multer({ storage: multer.memoryStorage() });

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
    const parts = url.split('/');
    const folderAndFileName = parts.slice(-2).join('/');
    return folderAndFileName.split('.')[0];
  } catch (err) {
    return null;
  }
};

// Helper to safely parse JSON strings or objects
const parseJsonObject = (data) => {
  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch (e) {
      return {};
    }
  }
  return data || {};
};

// ==========================================
// API ENDPOINTS
// ==========================================

/**
 * @route   POST /api/gold-repair
 * @desc    Create a new gold repair booking
 * @access  Public
 */
router.post('/', upload.array('jewelleryImages', 5), async (req, res) => {
  try {
    const {
      userId,
      serviceId,
      serviceName,
      jewelleryType,
      issueDescription,
      bookingDate,
      startTime,
      endTime,
      serviceType = 'DOORSTEP',
      customerType = 'SELF',
      specialInstructions = ''
    } = req.body;

    const customer = parseJsonObject(req.body.customer);
    const serviceLocation = parseJsonObject(req.body.serviceLocation);
    const pricing = parseJsonObject(req.body.pricing);

    // Upload files to Cloudinary if provided
    let imageUrls = [];
    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map(file => uploadToCloudinary(file.buffer));
      imageUrls = await Promise.all(uploadPromises);
    } else if (req.body.jewelleryImages) {
      imageUrls = Array.isArray(req.body.jewelleryImages)
        ? req.body.jewelleryImages
        : [req.body.jewelleryImages];
    }

    const insertQuery = `
      INSERT INTO gold_repairs (
        user_id, service_id, service_name, jewellery_type, issue_description,
        jewellery_images, booking_date, start_time, end_time, service_type,
        customer_type, customer, service_location, special_instructions, pricing
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *;
    `;

    const values = [
      userId,
      serviceId,
      serviceName,
      jewelleryType,
      issueDescription,
      imageUrls,
      bookingDate,
      startTime,
      endTime,
      serviceType,
      customerType,
      JSON.stringify(customer),
      JSON.stringify(serviceLocation),
      specialInstructions,
      JSON.stringify(pricing)
    ];

    const result = await pool.query(insertQuery, values);

    return res.status(201).json({
      success: true,
      message: 'Gold repair booking created successfully',
      data: result.rows[0]
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/gold-repair
 * @desc    Get all gold repair bookings
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const selectQuery = 'SELECT * FROM gold_repairs ORDER BY created_at DESC;';
    const result = await pool.query(selectQuery);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   GET /api/gold-repair/:id
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
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   PUT /api/gold-repair/:id
 * @desc    Update gold repair booking by ID
 * @access  Public
 */
router.put('/:id', upload.array('jewelleryImages', 5), async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch existing record first
    const checkQuery = 'SELECT * FROM gold_repairs WHERE id = $1;';
    const checkResult = await pool.query(checkQuery, [id]);

    if (checkResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Repair booking not found' });
    }

    const existingRecord = checkResult.rows[0];

    const {
      userId = existingRecord.user_id,
      serviceId = existingRecord.service_id,
      serviceName = existingRecord.service_name,
      jewelleryType = existingRecord.jewellery_type,
      issueDescription = existingRecord.issue_description,
      bookingDate = existingRecord.booking_date,
      startTime = existingRecord.start_time,
      endTime = existingRecord.end_time,
      serviceType = existingRecord.service_type,
      customerType = existingRecord.customer_type,
      specialInstructions = existingRecord.special_instructions
    } = req.body;

    const customer = req.body.customer ? parseJsonObject(req.body.customer) : existingRecord.customer;
    const serviceLocation = req.body.serviceLocation ? parseJsonObject(req.body.serviceLocation) : existingRecord.service_location;
    const pricing = req.body.pricing ? parseJsonObject(req.body.pricing) : existingRecord.pricing;

    // Handle uploaded images
    let imageUrls = existingRecord.jewellery_images || [];
    if (req.files && req.files.length > 0) {
      const uploadPromises = req.files.map(file => uploadToCloudinary(file.buffer));
      const newUrls = await Promise.all(uploadPromises);
      imageUrls = [...imageUrls, ...newUrls];
    }

    const updateQuery = `
      UPDATE gold_repairs
      SET 
        user_id = $1,
        service_id = $2,
        service_name = $3,
        jewellery_type = $4,
        issue_description = $5,
        jewellery_images = $6,
        booking_date = $7,
        start_time = $8,
        end_time = $9,
        service_type = $10,
        customer_type = $11,
        customer = $12,
        service_location = $13,
        special_instructions = $14,
        pricing = $15,
        updated_at = NOW()
      WHERE id = $16
      RETURNING *;
    `;

    const values = [
      userId,
      serviceId,
      serviceName,
      jewelleryType,
      issueDescription,
      imageUrls,
      bookingDate,
      startTime,
      endTime,
      serviceType,
      customerType,
      JSON.stringify(customer),
      JSON.stringify(serviceLocation),
      specialInstructions,
      JSON.stringify(pricing),
      id
    ];

    const result = await pool.query(updateQuery, values);

    return res.status(200).json({
      success: true,
      message: 'Gold repair booking updated successfully',
      data: result.rows[0]
    });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * @route   DELETE /api/gold-repair/:id
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

    // Remove associated images from Cloudinary
    if (record.jewellery_images && record.jewellery_images.length > 0) {
      for (const imgUrl of record.jewellery_images) {
        const publicId = getCloudinaryPublicId(imgUrl);
        if (publicId) {
          await cloudinary.uploader.destroy(publicId);
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
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
