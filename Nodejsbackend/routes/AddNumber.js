const express = require('express');
const router = express.Router();
const pool = require('../db'); // Your PostgreSQL connection pool

// ---------------------------------------------------------
// 1. POST: Add Email and Phone Number
// Endpoint: POST https://goldbackend-auyv.onrender.com/numbers/addnumber
// ---------------------------------------------------------
router.post("/addnumber", async (req, res) => {
  const { email, phone_number } = req.body;

  // Validation
  if (!email || !phone_number) {
    return res.status(400).json({
      success: false,
      message: "Both email and phone_number fields are required."
    });
  }

  try {
    // Inserts directly into your 'addphonenumber' table matching your verified schema
    const query = `
      INSERT INTO addphonenumber (email, phone_number) 
      VALUES ($1, $2) 
      RETURNING id, email, phone_number, created_at;
    `;
    const values = [email.trim(), phone_number.trim()];
    const result = await pool.query(query, values);

    return res.status(201).json({
      success: true,
      message: "Number and Email added successfully",
      data: result.rows[0]
    });

  } catch (error) {
    // Handles duplicate email constraint ('uk_addphone_email') gracefully
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: "A record with this email already exists."
      });
    }

    console.error("POST /addnumber Error Details:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message
    });
  }
});

// ---------------------------------------------------------
// 2. GET: Fetch All Numbers and Emails
// Endpoint: GET https://goldbackend-auyv.onrender.com/numbers/numberall
// ---------------------------------------------------------
router.get("/numberall", async (req, res) => {
  try {
    const query = "SELECT id, email, phone_number, created_at FROM addphonenumber ORDER BY id DESC;";
    const result = await pool.query(query);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });

  } catch (error) {
    console.error("GET /numberall Error Details:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message
    });
  }
});

// ---------------------------------------------------------
// 3. PUT: Update Number and Email by ID
// Endpoint: PUT https://goldbackend-auyv.onrender.com/numbers/number/1
// ---------------------------------------------------------
router.put("/number/:id", async (req, res) => {
  const targetId = req.params.id;
  const { email, phone_number } = req.body;

  if (!email && !phone_number) {
    return res.status(400).json({
      success: false,
      message: "Please provide either email or phone_number to update."
    });
  }

  try {
    let fields = [];
    let values = [];
    let queryIndex = 1;

    if (email) {
      fields.push(`email = $${queryIndex}`);
      values.push(email.trim());
      queryIndex++;
    }

    if (phone_number) {
      fields.push(`phone_number = $${queryIndex}`);
      values.push(phone_number.trim());
      queryIndex++;
    }

    values.push(targetId);
    const idIndex = queryIndex;

    const query = `
      UPDATE addphonenumber 
      SET ${fields.join(", ")} 
      WHERE id = $${idIndex} 
      RETURNING id, email, phone_number, created_at;
    `;

    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Record with ID ${targetId} not found.`
      });
    }

    return res.status(200).json({
      success: true,
      message: "Record updated successfully",
      data: result.rows[0]
    });

  } catch (error) {
    if (error.code === '23505') {
      return res.status(409).json({
        success: false,
        message: "Update failed. Email already exists in another record."
      });
    }

    console.error("PUT /number/:id Error Details:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message
    });
  }
});

// ---------------------------------------------------------
// 4. DELETE: Delete Record by ID
// Endpoint: DELETE https://goldbackend-auyv.onrender.com/numbers/delete/1
// ---------------------------------------------------------
router.delete("/delete/:id", async (req, res) => {
  const targetId = req.params.id;

  try {
    const query = "DELETE FROM addphonenumber WHERE id = $1 RETURNING id, email, phone_number;";
    const result = await pool.query(query, [targetId]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Record with ID ${targetId} not found.`
      });
    }

    return res.status(200).json({
      success: true,
      message: "Record deleted successfully",
      data: result.rows[0]
    });

  } catch (error) {
    console.error("DELETE /delete/:id Error Details:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message
    });
  }
});

module.exports = router;
