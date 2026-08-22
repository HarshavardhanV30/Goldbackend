const express = require("express");
const pool = require("../db"); // PostgreSQL pool instance
const router = express.Router();

// ==========================================
// 1. ORDERS APIS
// ==========================================

// ✅ POST /orders/checkout (Place an order with custom upfront payment & payment types)
router.post("/checkout", async (req, res) => {
  const { 
    userId, 
    addressId, 
    paymentMethod,       // Expected values: 'upi' or 'cod'
    expectedDelivery, 
    advancePaidAmount    // The custom amount entered by the user (e.g., 500, 1000)
  } = req.body;

  if (!userId || !addressId || !paymentMethod) {
    return res.status(400).json({ error: "Missing required checkout parameters" });
  }

  // Enforce valid payment methods
  if (!['upi', 'cod'].includes(paymentMethod.toLowerCase())) {
    return res.status(400).json({ error: "Payment method must be either 'upi' or 'cod'" });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Fetch and validate address
    const addressRes = await client.query(
      "SELECT * FROM addresses WHERE user_id = $1 AND id = $2",
      [userId, addressId]
    );
    if (addressRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "Address not found" });
    }
    const address = addressRes.rows[0];

    // Fetch and validate cart items
    const cartRes = await client.query(
      "SELECT * FROM carts WHERE user_id = $1",
      [userId]
    );
    if (cartRes.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "No items in cart" });
    }

    // Calculate subtotal accurately
    let subtotal = 0;
    const orderSummary = [];
    for (const item of cartRes.rows) {
      const itemTotal = (parseFloat(item.price) || 0) * (parseInt(item.quantity, 10) || 1);
      subtotal += itemTotal;
      orderSummary.push(item);
    }

    const totalAmount = subtotal;
    
    let advancePaid = 0;
    let balanceDue = totalAmount;
    let finalPaymentStatus = "pending";
    let initialPaymentType = "full";

    if (paymentMethod.toLowerCase() === "upi") {
        advancePaid = Number(advancePaidAmount) || 0;

        if (advancePaid < 0) advancePaid = 0;
        if (advancePaid > totalAmount) advancePaid = totalAmount;

        balanceDue = parseFloat((totalAmount - advancePaid).toFixed(2));

        if (balanceDue === 0) {
            finalPaymentStatus = "completed";
        } else if (advancePaid > 0) {
            finalPaymentStatus = "partial_paid";
        } else {
            finalPaymentStatus = "pending";
        }

        if (totalAmount > 0) {
          const paidPercentage = Math.round((advancePaid / totalAmount) * 100);
          
          if (paidPercentage === 10) initialPaymentType = "10%";
          else if (paidPercentage === 20) initialPaymentType = "20%";
          else if (paidPercentage === 50) initialPaymentType = "50%";
          else if (paidPercentage === 75) initialPaymentType = "75%";
          else if (paidPercentage === 100) initialPaymentType = "full";
          else initialPaymentType = "partial";
        }
    } else if (paymentMethod.toLowerCase() === "cod") {
        advancePaid = 0;
        balanceDue = totalAmount;
        finalPaymentStatus = "pending";
        initialPaymentType = "cod";
    }

    const insertOrderQuery = `
      INSERT INTO orders (
        user_id, address_id, address, payment_method,
        expected_delivery, subtotal, total_amount,
        order_summary, status, payment_status, order_date,
        advance_paid, balance_due, initial_payment_type
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'processing', $9, NOW(), $10, $11, $12)
      RETURNING id;
    `;

    const orderResult = await client.query(insertOrderQuery, [
      userId,
      addressId,
      JSON.stringify(address),
      paymentMethod.toLowerCase(),
      expectedDelivery,
      subtotal,
      totalAmount,
      JSON.stringify(orderSummary),
      finalPaymentStatus, 
      advancePaid,
      balanceDue,
      initialPaymentType
    ]);

    await client.query("DELETE FROM carts WHERE user_id = $1", [userId]);
    await client.query("COMMIT");
    
    res.status(201).json({ 
      message: "Order placed successfully", 
      orderId: orderResult.rows[0].id,
      totalAmount, 
      advancePaid, 
      balanceDue,
      paymentMethod,
      paymentStatus: finalPaymentStatus,
      initialPaymentType
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Checkout Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  } finally {
    client.release();
  }
});

// ✅ GET /orders/all (Fetch all system orders for admin panels)
router.get("/all", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM orders ORDER BY order_date DESC");
    res.status(200).json(result.rows);
  } catch (err) {
    console.error("Fetching orders failed:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ✅ POST /orders/update-status (Fixed to match frontend POST call and support cancellation reasons)
router.post('/update-status', async (req, res) => {
  const { orderId, status, paymentStatus, cancellation_reason } = req.body;

  if (!orderId) {
    return res.status(400).json({ error: "Order ID is required" });
  }

  try {
    let query = "UPDATE orders SET ";
    const params = [];
    
    if (status) {
      params.push(status);
      query += `status = $${params.length}`;
    }
    if (paymentStatus) {
      if (params.length > 0) query += ", ";
      params.push(paymentStatus);
      query += `payment_status = $${params.length}`;
    }
    if (cancellation_reason !== undefined) {
      if (params.length > 0) query += ", ";
      params.push(cancellation_reason);
      query += `cancellation_reason = $${params.length}`;
    }

    if (params.length === 0) {
      return res.status(400).json({ message: "No data items specified for modifications" });
    }

    params.push(orderId);
    query += ` WHERE id = $${params.length} RETURNING *`;

    const result = await pool.query(query, params);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Order records not found" });
    }

    res.status(200).json({ message: "Order records modified successfully", order: result.rows[0] });
  } catch (error) {
    console.error("Failed to update status:", error);
    res.status(500).json({ message: "Failed to update order criteria details" });
  }
});

// ✅ DELETE /orders/delete/:orderId (Remove order record)
router.delete('/delete/:orderId', async (req, res) => {
  const { orderId } = req.params;

  try {
    const result = await pool.query("DELETE FROM orders WHERE id = $1 RETURNING *", [orderId]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.status(200).json({ message: "Order deleted successfully", order: result.rows[0] });
  } catch (error) {
    console.error("Error deleting order:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});

module.exports = router;
