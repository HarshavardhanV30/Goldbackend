const express = require('express');
const router = express.Router();
const db = require('../db');
const cloudinary = require('../cloudinary');

// 1. POST - Create new Gold Repair Request
router.post('/', async (req, res) => {
  const { customer_name, phone_number, item_description, weight_grams, repair_cost, image_base64 } = req.body;

  if (!customer_name || !phone_number || !item_description || !weight_grams) {
    return res.status(400).json({ success: false, message: 'Required fields missing.' });
  }

  try {
    let image_url = null;

    // Optional Cloudinary Upload if image string is provided
    if (image_base64) {
      const uploadResponse = await cloudinary.uploader.upload(image_base64, {
        folder: 'gold_repair_items',
      });
      image_url = uploadResponse.secure_url;
    }

    const queryText = `
      INSERT INTO gold_repairs (customer_name, phone_number, item_description, weight_grams, repair_cost, image_url)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *;
    `;
    const values = [customer_name, phone_number, item_description, weight_grams, repair_cost || 0, image_url];

    const { rows } = await db.query(queryText, values);
    res.status(201).json({ success: true, message: 'Gold repair request created.', data: rows[0] });
  } catch (error) {
    console.error('Create Repair Error:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
});

// 2. GET - Retrieve all Gold Repair Requests
router.get('/', async (req, res) => {
  try {
    const queryText = 'SELECT * FROM gold_repairs ORDER BY repair_id DESC;';
    const { rows } = await db.query(queryText);
    res.status(200).json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    console.error('Fetch Repairs Error:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
});

// 3. GET - Retrieve single Gold Repair Request by ID
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const queryText = 'SELECT * FROM gold_repairs WHERE repair_id = $1;';
    const { rows } = await db.query(queryText, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Repair record not found.' });
    }

    res.status(200).json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Fetch Repair ID Error:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
});

// 4. PUT - Update Repair Details or Status
router.put('/:id', async (req, res) => {
  const { id } = req.params;
  const { item_description, repair_cost, status, image_base64 } = req.body;

  try {
    // Check if item exists
    const checkItem = await db.query('SELECT * FROM gold_repairs WHERE repair_id = $1;', [id]);
    if (checkItem.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Repair record not found.' });
    }

    let image_url = checkItem.rows[0].image_url;

    // Handle new image upload if provided
    if (image_base64) {
      const uploadResponse = await cloudinary.uploader.upload(image_base64, {
        folder: 'gold_repair_items',
      });
      image_url = uploadResponse.secure_url;
    }

    const queryText = `
      UPDATE gold_repairs
      SET item_description = COALESCE($1, item_description),
          repair_cost = COALESCE($2, repair_cost),
          status = COALESCE($3, status),
          image_url = COALESCE($4, image_url),
          updated_at = CURRENT_TIMESTAMP
      WHERE repair_id = $5
      RETURNING *;
    `;
    const values = [item_description, repair_cost, status, image_url, id];

    const { rows } = await db.query(queryText, values);
    res.status(200).json({ success: true, message: 'Repair record updated successfully.', data: rows[0] });
  } catch (error) {
    console.error('Update Repair Error:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
});

// 5. DELETE - Remove Repair Request
router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const queryText = 'DELETE FROM gold_repairs WHERE repair_id = $1 RETURNING *;';
    const { rows } = await db.query(queryText, [id]);

    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Repair record not found.' });
    }

    res.status(200).json({ success: true, message: 'Repair record deleted successfully.', data: rows[0] });
  } catch (error) {
    console.error('Delete Repair Error:', error);
    res.status(500).json({ success: false, message: 'Server error.', error: error.message });
  }
});

module.exports = router;
