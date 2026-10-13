const express = require("express");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../cloudinary");
const pool = require("../db");

const router = express.Router();

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "repair_gold",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    public_id: (req, file) => {
      const extension = file.originalname.split(".").pop().toLowerCase();
      const filename = file.originalname
        .replace(/\.[^/.]+$/, "")
        .replace(/[^a-zA-Z0-9-_]/g, "-");
      return `${Date.now()}-${filename}`;
    },
  },
});

const upload = multer({
  storage,
  limits: {
    files: 10,
    fileSize: 10 * 1024 * 1024,
  },
});

const getPublicIdFromUrl = (url) => {
  if (!url) return null;
  try {
    const cleanUrl = url.split("?")[0];
    const parts = cleanUrl.split("/upload/");
    if (parts.length < 2) return null;
    const publicPath = parts[1]
      .replace(/^v\d+\//, "")
      .replace(/\.[^/.]+$/, "");
    return publicPath;
  } catch (error) {
    return null;
  }
};

// 1. CREATE Repair Gold (POST /add)
router.post("/add", upload.array("images", 10), async (req, res) => {
  try {
    const serviceId = req.body.serviceId || null;
    const serviceName = req.body.serviceName || req.body.name || null;
    const jewelleryType = req.body.jewelleryType || req.body.category || null;
    const issueDescription = req.body.issueDescription || req.body.description || null;
    
    const files = req.files || [];
    const imagePaths = files.map((file) => file.path);

    const bookingDate = req.body.bookingDate || null;
    const startTime = req.body.startTime || null;
    const endTime = req.body.endTime || null;
    const serviceType = req.body.serviceType || "DOORSTEP";
    const customerType = req.body.customerType || "SELF";
    const fullName = req.body.fullName || req.body.full_name || null;
    const phone = req.body.phone || req.body.mobilenumber || null;
    const shopName = req.body.shopName || null;
    const houseNo = req.body.houseNo || null;
    const street = req.body.street || req.body.street_no || null;
    const area = req.body.area || null;
    const landmark = req.body.landmark || null;
    const mandal = req.body.mandal || null;
    const district = req.body.district || null;
    const city = req.body.city || null;
    const state = req.body.state || null;
    const pincode = req.body.pincode || null;
    const specialInstructions = req.body.specialInstructions || null;

    const fee = req.body.fee !== undefined && req.body.fee !== "" ? parseFloat(String(req.body.fee).replace(/[^0-9.]/g, "")) : 0;
    const tax = req.body.tax !== undefined && req.body.tax !== "" ? parseFloat(String(req.body.tax).replace(/[^0-9.]/g, "")) : 0;
    const total = req.body.total !== undefined && req.body.total !== "" ? parseFloat(String(req.body.total).replace(/[^0-9.]/g, "")) : 0;
    const status = req.body.status || "pending";

    if (!serviceName) {
      return res.status(400).json({ error: "Service name is required" });
    }
    if (!fullName) {
      return res.status(400).json({ error: "Full name is required" });
    }
    if (!phone) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    const query = `
      INSERT INTO repairgold (
        service_id, service_name, jewellery_type, issue_description, images,
        booking_date, start_time, end_time, service_type, customer_type,
        full_name, phone, shop_name, house_no, street, area, landmark,
        mandal, district, city, state, pincode, special_instructions,
        fee, tax, total, status, created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
        $21, $22, $23, $24, $25, $26, $27, NOW(), NOW()
      )
      RETURNING *
    `;

    const values = [
      serviceId, serviceName, jewelleryType, issueDescription, imagePaths,
      bookingDate, startTime, endTime, serviceType, customerType,
      fullName, phone, shopName, houseNo, street, area, landmark,
      mandal, district, city, state, pincode, specialInstructions,
      fee, tax, total, status
    ];

    const result = await pool.query(query, values);

    return res.status(201).json({
      message: "Repair gold booking added successfully",
      data: {
        ...result.rows[0],
        images: result.rows[0].images || [],
      },
    });
  } catch (error) {
    console.error("REPAIR GOLD ADD ERROR:", error);
    return res.status(500).json({
      error: "Failed to add repair gold booking",
      details: error.message,
    });
  }
});

// 2. GET ALL Repair Gold (GET /all)
router.get("/all", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM repairgold ORDER BY id DESC");
    const data = result.rows.map((row) => ({
      ...row,
      images: row.images || [],
    }));
    return res.status(200).json(data);
  } catch (error) {
    console.error("GET REPAIR GOLD LIST ERROR:", error);
    return res.status(500).json({ error: "Failed to fetch repair gold bookings" });
  }
});

// 3. GET Repair Gold by ID (GET /:id)
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query("SELECT * FROM repairgold WHERE id = $1", [id]);

    if (!result.rows.length) {
      return res.status(404).json({ error: "Repair gold booking not found" });
    }

    return res.status(200).json({
      ...result.rows[0],
      images: result.rows[0].images || [],
    });
  } catch (error) {
    console.error("GET REPAIR GOLD BY ID ERROR:", error);
    return res.status(500).json({ error: "Failed to fetch repair gold booking" });
  }
});

// 4. UPDATE Repair Gold by ID (PUT /:id)
router.put("/:id", upload.array("images", 10), async (req, res) => {
  try {
    const { id } = req.params;

    const currentResult = await pool.query("SELECT images, status FROM repairgold WHERE id = $1", [id]);
    if (!currentResult.rows.length) {
      return res.status(404).json({ error: "Repair gold booking not found" });
    }

    const currentImages = currentResult.rows[0].images || [];
    const currentStatus = currentResult.rows[0].status;
    let finalImages = currentImages;

    if (req.files && req.files.length > 0) {
      await Promise.all(
        currentImages.map(async (url) => {
          const publicId = getPublicIdFromUrl(url);
          if (publicId) {
            try {
              await cloudinary.uploader.destroy(publicId);
            } catch (err) {
              console.error("CLOUDINARY DELETE ERROR:", err.message);
            }
          }
        })
      );
      finalImages = req.files.map((file) => file.path);
    }

    const serviceId = req.body.serviceId || null;
    const serviceName = req.body.serviceName || req.body.name || null;
    const jewelleryType = req.body.jewelleryType || req.body.category || null;
    const issueDescription = req.body.issueDescription || req.body.description || null;
    const bookingDate = req.body.bookingDate || null;
    const startTime = req.body.startTime || null;
    const endTime = req.body.endTime || null;
    const serviceType = req.body.serviceType || "DOORSTEP";
    const customerType = req.body.customerType || "SELF";
    const fullName = req.body.fullName || req.body.full_name || null;
    const phone = req.body.phone || req.body.mobilenumber || null;
    const shopName = req.body.shopName || null;
    const houseNo = req.body.houseNo || null;
    const street = req.body.street || req.body.street_no || null;
    const area = req.body.area || null;
    const landmark = req.body.landmark || null;
    const mandal = req.body.mandal || null;
    const district = req.body.district || null;
    const city = req.body.city || null;
    const state = req.body.state || null;
    const pincode = req.body.pincode || null;
    const specialInstructions = req.body.specialInstructions || null;

    const fee = req.body.fee !== undefined && req.body.fee !== "" ? parseFloat(String(req.body.fee).replace(/[^0-9.]/g, "")) : 0;
    const tax = req.body.tax !== undefined && req.body.tax !== "" ? parseFloat(String(req.body.tax).replace(/[^0-9.]/g, "")) : 0;
    const total = req.body.total !== undefined && req.body.total !== "" ? parseFloat(String(req.body.total).replace(/[^0-9.]/g, "")) : 0;
    const status = req.body.status || currentStatus;

    const query = `
      UPDATE repairgold
      SET
        service_id = $1,
        service_name = $2,
        jewellery_type = $3,
        issue_description = $4,
        images = $5,
        booking_date = $6,
        start_time = $7,
        end_time = $8,
        service_type = $9,
        customer_type = $10,
        full_name = $11,
        phone = $12,
        shop_name = $13,
        house_no = $14,
        street = $15,
        area = $16,
        landmark = $17,
        mandal = $18,
        district = $19,
        city = $20,
        state = $21,
        pincode = $22,
        special_instructions = $23,
        fee = $24,
        tax = $25,
        total = $26,
        status = $27,
        updated_at = NOW()
      WHERE id = $28
      RETURNING *
    `;

    const values = [
      serviceId, serviceName, jewelleryType, issueDescription, finalImages,
      bookingDate, startTime, endTime, serviceType, customerType,
      fullName, phone, shopName, houseNo, street, area, landmark,
      mandal, district, city, state, pincode, specialInstructions,
      fee, tax, total, status, id
    ];

    const result = await pool.query(query, values);

    return res.status(200).json({
      message: "Repair gold booking updated successfully",
      data: {
        ...result.rows[0],
        images: result.rows[0].images || [],
      },
    });
  } catch (error) {
    console.error("UPDATE REPAIR GOLD ERROR:", error);
    return res.status(500).json({
      error: "Failed to update repair gold booking",
      details: error.message,
    });
  }
});

// 5. DELETE Repair Gold by ID (DELETE /:id)
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query("SELECT images FROM repairgold WHERE id = $1", [id]);
    if (!result.rows.length) {
      return res.status(404).json({ error: "Repair gold booking not found" });
    }

    const imagePaths = result.rows[0].images || [];

    await Promise.all(
      imagePaths.map(async (url) => {
        const publicId = getPublicIdFromUrl(url);
        if (publicId) {
          try {
            await cloudinary.uploader.destroy(publicId);
          } catch (err) {
            console.error("CLOUDINARY DELETE ERROR:", err.message);
          }
        }
      })
    );

    await pool.query("DELETE FROM repairgold WHERE id = $1", [id]);

    return res.status(200).json({
      message: "Repair gold booking deleted successfully",
    });
  } catch (error) {
    console.error("DELETE REPAIR GOLD ERROR:", error);
    return res.status(500).json({
      error: "Failed to delete repair gold booking",
      details: error.message,
    });
  }
});

module.exports = router;
