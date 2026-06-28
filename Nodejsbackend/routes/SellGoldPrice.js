const express = require('express');
const router = express.Router();
const pool = require('../db'); // Your PostgreSQL connection pool

// ---------------------------------------------------------
// 1. POST: Add Karat, Price, and Date
// Endpoint: POST https://goldbackend-auyv.onrender.com/numbers/add
// ---------------------------------------------------------
router.post("/add", async (req, res) => {
  const { karat, price, date } = req.body;

  // Validation
  if (!karat || !price || !date) {
    return res.status(400).json({
      success: false,
      message: "Karat, price, and date fields are required."
    });
  }

  try {
    // Inserts directly into your sell gold tracking table
    const query = `
      INSERT INTO sell_gold_prices (karat, price, date) 
      VALUES ($1, $2, $3) 
      RETURNING id, karat, price, date, created_at;
    `;
    const values = [Number(karat), Number(price), date];
    const result = await pool.query(query, values);

    return res.status(201).json({
      success: true,
      message: "Seller gold price details added successfully",
      data: result.rows[0]
    });

  } catch (error) {
    console.error("POST /add Error Details:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message
    });
  }
});

// ---------------------------------------------------------
// 2. GET: Fetch All Seller Gold Prices
// Endpoint: GET https://goldbackend-auyv.onrender.com/numbers/numberall
// ---------------------------------------------------------
router.get("/all", async (req, res) => {
  try {
    // Fetches all records from sell_gold_prices, newest entries first
    const query = "SELECT id, karat, price, date, created_at FROM sell_gold_prices ORDER BY id DESC;";
    const result = await pool.query(query);

    return res.status(200).json({
      success: true,
      count: result.rows.length,
      data: result.rows
    });

  } catch (error) {
    console.error("GET /all Error Details:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message
    });
  }
});

// ---------------------------------------------------------
// 3. PUT: Update Karat, Price, and Date by ID
// Endpoint: PUT https://goldbackend-auyv.onrender.com/numbers/number/1
// ---------------------------------------------------------
router.put("/:id", async (req, res) => {
  const targetId = req.params.id;
  const { karat, price, date } = req.body;

  if (!karat && !price && !date) {
    return res.status(400).json({
      success: false,
      message: "Please provide either karat, price, or date to update."
    });
  }

  try {
    let fields = [];
    let values = [];
    let queryIndex = 1;

    if (karat) {
      fields.push(`karat = $${queryIndex}`);
      values.push(Number(karat));
      queryIndex++;
    }

    if (price) {
      fields.push(`price = $${queryIndex}`);
      values.push(Number(price));
      queryIndex++;
    }

    if (date) {
      fields.push(`date = $${queryIndex}`);
      values.push(date);
      queryIndex++;
    }

    // Push targetId last for the WHERE clause
    values.push(targetId);
    const idIndex = queryIndex;

    const query = `
      UPDATE sell_gold_prices 
      SET ${fields.join(", ")} 
      WHERE id = $${idIndex} 
      RETURNING id, karat, price, date, created_at;
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
    console.error("PUT /:id Error Details:", error.message);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message
    });
  }
});

// ---------------------------------------------------------
// 4. DELETE: Delete Seller Gold Record by ID
// Endpoint: DELETE https://goldbackend-auyv.onrender.com/numbers/delete/1
// ---------------------------------------------------------
router.delete("/delete/:id", async (req, res) => {
  const targetId = req.params.id;

  try {
    const query = "DELETE FROM sell_gold_prices WHERE id = $1 RETURNING id, karat, price, date, created_at;";
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
