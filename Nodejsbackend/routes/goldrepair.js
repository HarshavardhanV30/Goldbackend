const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('./db');
const cloudinary = require('./cloudinary');

// Configure Multer storage & limits
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit per image
});

// Helper: Cloudinary Upload Stream
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

// Helpers for Data Normalization (Fixes Postgres Type Errors)
const parseString = (val) => {
  if (val === undefined || val === null || val === 'null' || val === 'undefined') return null;
  const str = String(val).trim();
  return str === '' ? null : str;
};

const parseNum = (val, defaultVal = 0) => {
  if (val === undefined || val === null || val === '') return defaultVal;
  const num = parseFloat(val);
  return isNaN(num) ? defaultVal : num;
};

// ==========================================
// POST /goldrepair/add
// ==========================================
router.post('/add', (req, res) => {
  // Wrap multer middleware to capture file error gracefully
  upload.array('jewelleryImages', 5)(req, res, async (err) => {
    if (err) {
      console.error('Multer Upload Error:', err);
      return res.status(400).json({ success: false, message: `File upload error: ${err.message}` });
    }

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

      // Handle images (Uploaded files or string payload)
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
        parseString(serviceId),
        parseString(serviceName),
        parseString(jewelleryType),
        parseString(issueDescription),
        imageUrls,
        parseString(bookingDate),
        parseString(startTime),
        parseString(endTime),
        parseString(serviceType) || 'DOORSTEP',
        parseString(customerType) || 'SELF',
        parseString(fullName),
        parseString(phone),
        parseString(houseNo),
        parseString(street),
        parseString(area),
        parseString(landmark),
        parseString(city),
        parseString(district),
        parseString(state),
        parseString(pincode),
        parseString(specialInstructions) || '',
        parseNum(serviceFee, 0),
        parseNum(taxAmount, 0),
        parseNum(totalAmount, 0)
      ];

      const result = await pool.query(insertQuery, values);

      return res.status(201).json({
        success: true,
        message: 'Gold repair booking created successfully',
        data: result.rows[0]
      });

    } catch (dbError) {
      console.error('Database Insertion Error:', dbError);
      return res.status(500).json({
        success: false,
        error: dbError.message || 'Database transaction failed'
      });
    }
  });
});

module.exports = router;
