const express = require("express");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../cloudinary");
const pool = require("../db");

const router = express.Router();

// ======================================================
// CLOUDINARY STORAGE CONFIGURATION
// ======================================================

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "seller",
    allowed_formats: ["jpg", "png", "jpeg", "webp"],
    public_id: (req, file) => {
      return Date.now() + "-" + file.originalname;
    },
  },
});

const upload = multer({ storage });

// ======================================================
// HELPER FUNCTION - GET CLOUDINARY PUBLIC ID
// ======================================================

const getPublicIdFromUrl = (url) => {
  try {
    const parts = url.split("/");
    const filename = parts[parts.length - 1];

    // Remove file extension
    const publicId = filename.substring(0, filename.lastIndexOf("."));

    return `seller/${publicId}`;
  } catch (error) {
    console.error("Error extracting Cloudinary public ID:", error.message);
    return null;
  }
};

// ======================================================
// 1. ADD SELLER GOLD PRODUCT
// POST /seller/add
// ======================================================

router.post("/add", upload.array("images", 10), async (req, res) => {
  const {
    user_id,
    name,
    category,
    weight,
    purity,
    condition,
    price,
    description,
    full_name,
    mobilenumber,
    typeofselling,
    street_no,
    landmark,
    state,
    district,
    mandal,
    pincode,
  } = req.body;

  const files = req.files || [];

  try {
    const imagePaths = files.map((file) => file.path);

    const result = await pool.query(
      `INSERT INTO sellergold
      (
        user_id,
        name,
        category,
        weight,
        purity,
        condition,
        price,
        description,
        images,
        full_name,
        mobilenumber,
        typeofselling,
        status,
        street_no,
        landmark,
        state,
        district,
        mandal,
        pincode
      )
      VALUES
      (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15,
        $16, $17, $18, $19
      )
      RETURNING *`,
      [
        user_id,
        name,
        category,
        weight,
        purity,
        condition,
        price,
        description,
        imagePaths,
        full_name,
        mobilenumber,
        typeofselling,
        "pending",
        street_no,
        landmark,
        state,
        district,
        mandal,
        pincode,
      ]
    );

    res.status(201).json({
      success: true,
      message:
        "Seller gold product added successfully and is awaiting approval",
      data: result.rows[0],
    });
  } catch (err) {
    console.error(
      "Error inserting seller gold product:",
      err.message
    );

    res.status(500).json({
      success: false,
      error: "Failed to add seller gold product",
      details: err.message,
    });
  }
});

// ======================================================
// 2. UPDATE PRODUCT STATUS
// PATCH /seller/:id/status
// ======================================================

router.patch("/:id/status", async (req, res) => {
  const { id } = req.params;

  const { status, user_id } = req.body;

  const allowedStatuses = [
    "pending",
    "approved",
    "rejected",
  ];

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      error:
        "Invalid status. Use 'pending', 'approved', or 'rejected'.",
    });
  }

  try {
    let queryText;
    let queryParams;

    if (user_id) {
      queryText = `
        UPDATE sellergold
        SET status = $1,
            user_id = $2
        WHERE id = $3
        RETURNING *
      `;

      queryParams = [
        status,
        user_id,
        id,
      ];
    } else {
      queryText = `
        UPDATE sellergold
        SET status = $1
        WHERE id = $2
        RETURNING *
      `;

      queryParams = [
        status,
        id,
      ];
    }

    const result = await pool.query(
      queryText,
      queryParams
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Seller gold product not found",
      });
    }

    res.status(200).json({
      success: true,
      message: `Product status updated to '${status}' successfully`,
      data: result.rows[0],
    });
  } catch (err) {
    console.error(
      "Error updating seller gold status:",
      err.message
    );

    res.status(500).json({
      success: false,
      error: "Failed to update product status",
      details: err.message,
    });
  }
});

// ======================================================
// 3. GET ALL SELLER GOLD PRODUCTS
// GET /seller/all
// ======================================================

router.get("/all", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM sellergold ORDER BY id DESC"
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error(
      "Error fetching seller gold products:",
      err.message
    );

    res.status(500).json({
      success: false,
      error: "Failed to fetch seller gold products",
      details: err.message,
    });
  }
});

// ======================================================
// 4. GET SELLER GOLD PRODUCT BY PRODUCT ID
// IMPORTANT: Changed from /:id to /product/:id
// GET /seller/product/123
// ======================================================

router.get("/product/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const result = await pool.query(
      "SELECT * FROM sellergold WHERE id = $1",
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Seller gold product not found",
      });
    }

    res.status(200).json(result.rows[0]);
  } catch (err) {
    console.error(
      "Error fetching seller gold product:",
      err.message
    );

    res.status(500).json({
      success: false,
      error: "Failed to fetch seller gold product",
      details: err.message,
    });
  }
});

// ======================================================
// 5. GET ALL SELLER GOLD PRODUCTS BY USER ID
//
// Based on your screenshot:
// router.get("/:user_id", ...)
//
// Example:
// GET /seller/123
// Here 123 = user_id
// ======================================================

router.get("/:user_id", async (req, res) => {
  const { user_id } = req.params;

  try {
    const result = await pool.query(
      `SELECT *
       FROM sellergold
       WHERE user_id = $1
       ORDER BY id DESC`,
      [user_id]
    );

    res.status(200).json(result.rows);
  } catch (err) {
    console.error(
      "Error fetching seller gold products for user:",
      err.message
    );

    res.status(500).json({
      success: false,
      error:
        "Failed to fetch user seller gold products",
      details: err.message,
    });
  }
});

// ======================================================
// 6. UPDATE SELLER GOLD PRODUCT
// PUT /seller/:id
// ======================================================

router.put(
  "/:id",
  upload.array("images", 10),
  async (req, res) => {
    const { id } = req.params;

    const {
      user_id,
      name,
      category,
      weight,
      purity,
      condition,
      price,
      description,
      full_name,
      mobilenumber,
      typeofselling,
      status,
      street_no,
      landmark,
      state,
      district,
      mandal,
      pincode,
    } = req.body;

    try {
      // Get current product
      const currentProductResult =
        await pool.query(
          `SELECT images, status, user_id
           FROM sellergold
           WHERE id = $1`,
          [id]
        );

      if (
        currentProductResult.rows.length === 0
      ) {
        return res.status(404).json({
          success: false,
          error:
            "Seller gold product not found",
        });
      }

      const currentProduct =
        currentProductResult.rows[0];

      const currentImages =
        currentProduct.images || [];

      const currentStatus =
        currentProduct.status;

      const currentUserId =
        currentProduct.user_id;

      let finalImages = currentImages;

      // If new images uploaded
      if (
        req.files &&
        req.files.length > 0
      ) {
        // Delete old images
        await Promise.all(
          currentImages.map(
            async (url) => {
              const publicId =
                getPublicIdFromUrl(url);

              if (publicId) {
                try {
                  await cloudinary.uploader.destroy(
                    publicId
                  );
                } catch (error) {
                  console.error(
                    "Cloudinary delete error:",
                    error.message
                  );
                }
              }
            }
          )
        );

        // Save new images
        finalImages = req.files.map(
          (file) => file.path
        );
      }

      const updatedStatus =
        status || currentStatus;

      const updatedUserId =
        user_id || currentUserId;

      const result = await pool.query(
        `UPDATE sellergold
         SET
           user_id = $1,
           name = $2,
           category = $3,
           weight = $4,
           purity = $5,
           condition = $6,
           price = $7,
           description = $8,
           images = $9,
           full_name = $10,
           mobilenumber = $11,
           typeofselling = $12,
           status = $13,
           street_no = $14,
           landmark = $15,
           state = $16,
           district = $17,
           mandal = $18,
           pincode = $19
         WHERE id = $20
         RETURNING *`,
        [
          updatedUserId,
          name,
          category,
          weight,
          purity,
          condition,
          price,
          description,
          finalImages,
          full_name,
          mobilenumber,
          typeofselling,
          updatedStatus,
          street_no,
          landmark,
          state,
          district,
          mandal,
          pincode,
          id,
        ]
      );

      res.status(200).json({
        success: true,
        message:
          "Seller gold product updated successfully",
        data: result.rows[0],
      });
    } catch (err) {
      console.error(
        "Error updating seller gold product:",
        err.message
      );

      res.status(500).json({
        success: false,
        error:
          "Failed to update seller gold product",
        details: err.message,
      });
    }
  }
);

// ======================================================
// 7. DELETE SELLER GOLD PRODUCT
// DELETE /seller/:id
// ======================================================

router.delete("/:id", async (req, res) => {
  const { id } = req.params;

  try {
    // Get product images
    const result = await pool.query(
      `SELECT images
       FROM sellergold
       WHERE id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Product not found",
      });
    }

    const imagePaths =
      result.rows[0].images || [];

    // Delete images from Cloudinary
    await Promise.all(
      imagePaths.map(async (url) => {
        const publicId =
          getPublicIdFromUrl(url);

        if (publicId) {
          try {
            await cloudinary.uploader.destroy(
              publicId
            );
          } catch (error) {
            console.error(
              "Cloudinary delete error:",
              error.message
            );
          }
        }
      })
    );

    // Delete product from PostgreSQL
    await pool.query(
      "DELETE FROM sellergold WHERE id = $1",
      [id]
    );

    res.status(200).json({
      success: true,
      message:
        "Seller gold product deleted successfully",
    });
  } catch (err) {
    console.error(
      "Error deleting seller gold product:",
      err.message
    );

    res.status(500).json({
      success: false,
      error:
        "Failed to delete seller gold product",
      details: err.message,
    });
  }
});

module.exports = router;
