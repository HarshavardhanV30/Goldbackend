const express = require("express");
const pool = require("../db");

const router = express.Router();

// 1. CREATE Vendor Address (POST /add)
router.post("/add", async (req, res) => {
  try {
    // Extracting fields from request body, handling both camelCase and snake_case
    const vendorId = req.body.vendorId || req.body.vendor_id || null;
    const shopName = req.body.shopName || req.body.shop_name || null;
    const houseNo = req.body.houseNo || req.body.house_no || null;
    const street = req.body.street || null;
    const area = req.body.area || null;
    const landmark = req.body.landmark || null;
    const mandal = req.body.mandal || null;
    const district = req.body.district || null;
    const city = req.body.city || null;
    const state = req.body.state || null;
    const pincode = req.body.pincode || null;

    if (!shopName) {
      return res.status(400).json({ error: "Shop name is required" });
    }

    const query = `
      INSERT INTO vendor_address (
        vendor_id, shop_name, house_no, street, area, landmark,
        mandal, district, city, state, pincode, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW()
      )
      RETURNING *
    `;

    const values = [
      vendorId, shopName, houseNo, street, area, landmark,
      mandal, district, city, state, pincode
    ];

    const result = await pool.query(query, values);

    return res.status(201).json({
      message: "Vendor address added successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("🔥🔥🔥 EXACT DATABASE ERROR:", error.message);
    console.error("🔥🔥🔥 ERROR DETAILS:", error.detail);
    
    return res.status(500).json({
      error: "Failed to add vendor address",
      real_reason: error.message,      // Shows exactly why it failed in Postman
      postgres_detail: error.detail,   // Shows if a column is missing
      code: error.code
    });
  }
});

// 2. GET ALL Vendor Addresses (GET /all)
router.get("/all", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM vendor_address ORDER BY id DESC");
    
    return res.status(200).json(result.rows);
  } catch (error) {
    console.error("GET VENDOR ADDRESSES LIST ERROR:", error);
    return res.status(500).json({ error: "Failed to fetch vendor addresses" });
  }
});

// 3. GET Vendor Address by ID (GET /:id)
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("SELECT * FROM vendor_address WHERE id = $1", [id]);

    if (!result.rows.length) {
      return res.status(404).json({ error: "Vendor address not found" });
    }

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    console.error("GET VENDOR ADDRESS BY ID ERROR:", error);
    return res.status(500).json({ error: "Failed to fetch vendor address" });
  }
});

// 4. UPDATE Vendor Address by ID (PUT /:id)
router.put("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Check if the record exists first
    const currentResult = await pool.query("SELECT * FROM vendor_address WHERE id = $1", [id]);
    if (!currentResult.rows.length) {
      return res.status(404).json({ error: "Vendor address not found" });
    }

    const currentData = currentResult.rows[0];

    // Map request body to variables, fallback to existing DB values if not provided
    const vendorId = req.body.vendorId || req.body.vendor_id || currentData.vendor_id;
    const shopName = req.body.shopName || req.body.shop_name || currentData.shop_name;
    const houseNo = req.body.houseNo || req.body.house_no !== undefined ? (req.body.houseNo || req.body.house_no) : currentData.house_no;
    const street = req.body.street !== undefined ? req.body.street : currentData.street;
    const area = req.body.area !== undefined ? req.body.area : currentData.area;
    const landmark = req.body.landmark !== undefined ? req.body.landmark : currentData.landmark;
    const mandal = req.body.mandal !== undefined ? req.body.mandal : currentData.mandal;
    const district = req.body.district !== undefined ? req.body.district : currentData.district;
    const city = req.body.city !== undefined ? req.body.city : currentData.city;
    const state = req.body.state !== undefined ? req.body.state : currentData.state;
    const pincode = req.body.pincode !== undefined ? req.body.pincode : currentData.pincode;

    const query = `
      UPDATE vendor_address
      SET
        vendor_id = $1,
        shop_name = $2,
        house_no = $3,
        street = $4,
        area = $5,
        landmark = $6,
        mandal = $7,
        district = $8,
        city = $9,
        state = $10,
        pincode = $11,
        updated_at = NOW()
      WHERE id = $12
      RETURNING *
    `;

    const values = [
      vendorId, shopName, houseNo, street, area, landmark,
      mandal, district, city, state, pincode, id
    ];

    const result = await pool.query(query, values);

    return res.status(200).json({
      message: "Vendor address updated successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error("🔥🔥🔥 EXACT UPDATE DATABASE ERROR:", error.message);
    return res.status(500).json({
      error: "Failed to update vendor address",
      real_reason: error.message,
      postgres_detail: error.detail,
    });
  }
});

// 5. DELETE Vendor Address by ID (DELETE /:id)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Check if it exists before deleting
    const result = await pool.query("SELECT id FROM vendor_address WHERE id = $1", [id]);
    if (!result.rows.length) {
      return res.status(404).json({ error: "Vendor address not found" });
    }

    await pool.query("DELETE FROM vendor_address WHERE id = $1", [id]);

    return res.status(200).json({
      message: "Vendor address deleted successfully",
    });
  } catch (error) {
    console.error("DELETE VENDOR ADDRESS ERROR:", error);
    return res.status(500).json({
      error: "Failed to delete vendor address",
      details: error.message,
    });
  }
});

module.exports = router;
