const express = require("express");
const multer = require("multer");
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../cloudinary");
const pool = require("../db");

const router = express.Router();

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "seller",
    allowed_formats: ["jpg", "jpeg", "png", "webp"],
    public_id: (req, file) => {
      const extension = file.originalname
        .split(".")
        .pop()
        .toLowerCase();

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

    if (parts.length < 2) {
      return null;
    }

    const publicPath = parts[1]
      .replace(/^v\d+\//, "")
      .replace(/\.[^/.]+$/, "");

    return publicPath;
  } catch (error) {
    return null;
  }
};

router.post(
  "/add",
  upload.array("images", 10),
  async (req, res) => {
    try {
      const name =
        req.body.name ||
        req.body.productName ||
        null;

      const category =
        req.body.category || null;

      const weight =
        req.body.weight !== undefined &&
        req.body.weight !== ""
          ? parseFloat(
              String(req.body.weight).replace(
                /[^0-9.]/g,
                ""
              )
            )
          : null;

      const purity =
        req.body.purity || null;

      const condition =
        req.body.condition || null;

      const price =
        req.body.price !== undefined &&
        req.body.price !== ""
          ? parseFloat(
              String(req.body.price).replace(
                /[^0-9.]/g,
                ""
              )
            )
          : null;

      const description =
        req.body.description || null;

      const full_name =
        req.body.full_name ||
        req.body.fullName ||
        null;

      const mobilenumber =
        req.body.mobilenumber ||
        req.body.phoneNumber ||
        null;

      const addharcard =
        req.body.addharcard ||
        req.body.aadhaarNumber ||
        req.body.document_id ||
        null;

      const typeofselling =
        req.body.typeofselling ||
        req.body.goldType ||
        null;

      const street_no =
        req.body.street_no ||
        req.body.streetNo ||
        null;

      const landmark =
        req.body.landmark || null;

      const state =
        req.body.state ||
        req.body.stateName ||
        null;

      const district =
        req.body.district || null;

      const mandal =
        req.body.mandal || null;

      const pincode =
        req.body.pincode || null;

      if (!name) {
        return res.status(400).json({
          error: "Product name is required",
        });
      }

      if (!category) {
        return res.status(400).json({
          error: "Category is required",
        });
      }

      if (!weight || weight <= 0) {
        return res.status(400).json({
          error: "Valid weight is required",
        });
      }

      if (!purity) {
        return res.status(400).json({
          error: "Purity is required",
        });
      }

      if (!condition) {
        return res.status(400).json({
          error: "Condition is required",
        });
      }

      if (!price || price <= 0) {
        return res.status(400).json({
          error: "Valid price is required",
        });
      }

      if (!full_name) {
        return res.status(400).json({
          error: "Full name is required",
        });
      }

      if (!mobilenumber) {
        return res.status(400).json({
          error: "Mobile number is required",
        });
      }

      if (!typeofselling) {
        return res.status(400).json({
          error: "Type of selling is required",
        });
      }

      const files = req.files || [];

      const imagePaths = files.map(
        (file) => file.path
      );

      const result = await pool.query(
        `INSERT INTO sellergold (
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
          addharcard,
          typeofselling,
          street_no,
          landmark,
          state,
          district,
          mandal,
          pincode,
          status,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17,
          $18,
          'pending',
          NOW(),
          NOW()
        )
        RETURNING *`,
        [
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
          addharcard,
          typeofselling,
          street_no,
          landmark,
          state,
          district,
          mandal,
          pincode,
        ]
      );

      return res.status(201).json({
        message:
          "Seller gold product added successfully and is awaiting approval",
        data: {
          ...result.rows[0],
          images: result.rows[0].images || [],
        },
      });
    } catch (error) {
      console.error(
        "SELLER ADD ERROR:",
        error
      );

      return res.status(500).json({
        error:
          "Failed to add seller gold product",
        details: error.message,
      });
    }
  }
);

router.patch(
  "/:id/status",
  async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      const allowedStatuses = [
        "pending",
        "approved",
        "rejected",
      ];

      if (
        !allowedStatuses.includes(status)
      ) {
        return res.status(400).json({
          error:
            "Invalid status. Use pending, approved, or rejected.",
        });
      }

      const result = await pool.query(
        `UPDATE sellergold
         SET status = $1,
             updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [status, id]
      );

      if (!result.rows.length) {
        return res.status(404).json({
          error:
            "Seller gold product not found",
        });
      }

      return res.status(200).json({
        message:
          `Product status updated to '${status}' successfully`,
        data: {
          ...result.rows[0],
          images:
            result.rows[0].images || [],
        },
      });
    } catch (error) {
      console.error(
        "STATUS UPDATE ERROR:",
        error
      );

      return res.status(500).json({
        error:
          "Failed to update product status",
        details: error.message,
      });
    }
  }
);

router.get(
  "/all",
  async (req, res) => {
    try {
      const result = await pool.query(
        "SELECT * FROM sellergold ORDER BY id DESC"
      );

      const data = result.rows.map(
        (row) => ({
          ...row,
          images: row.images || [],
        })
      );

      return res.status(200).json(data);
    } catch (error) {
      console.error(
        "GET SELLER PRODUCTS ERROR:",
        error
      );

      return res.status(500).json({
        error:
          "Failed to fetch seller gold products",
      });
    }
  }
);

router.get(
  "/:id",
  async (req, res) => {
    try {
      const { id } = req.params;

      const result = await pool.query(
        "SELECT * FROM sellergold WHERE id = $1",
        [id]
      );

      if (!result.rows.length) {
        return res.status(404).json({
          error:
            "Seller gold product not found",
        });
      }

      return res.status(200).json({
        ...result.rows[0],
        images:
          result.rows[0].images || [],
      });
    } catch (error) {
      console.error(
        "GET SELLER PRODUCT ERROR:",
        error
      );

      return res.status(500).json({
        error:
          "Failed to fetch seller gold product",
      });
    }
  }
);

router.put(
  "/:id",
  upload.array("images", 10),
  async (req, res) => {
    try {
      const { id } = req.params;

      const currentResult =
        await pool.query(
          "SELECT images, status FROM sellergold WHERE id = $1",
          [id]
        );

      if (!currentResult.rows.length) {
        return res.status(404).json({
          error:
            "Seller gold product not found",
        });
      }

      const currentImages =
        currentResult.rows[0].images || [];

      const currentStatus =
        currentResult.rows[0].status;

      let finalImages = currentImages;

      if (
        req.files &&
        req.files.length > 0
      ) {
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
                    "CLOUDINARY DELETE ERROR:",
                    error.message
                  );
                }
              }
            }
          )
        );

        finalImages = req.files.map(
          (file) => file.path
        );
      }

      const name =
        req.body.name ||
        req.body.productName ||
        null;

      const category =
        req.body.category || null;

      const weight =
        req.body.weight
          ? parseFloat(
              String(req.body.weight).replace(
                /[^0-9.]/g,
                ""
              )
            )
          : null;

      const purity =
        req.body.purity || null;

      const condition =
        req.body.condition || null;

      const price =
        req.body.price
          ? parseFloat(
              String(req.body.price).replace(
                /[^0-9.]/g,
                ""
              )
            )
          : null;

      const description =
        req.body.description || null;

      const full_name =
        req.body.full_name ||
        req.body.fullName ||
        null;

      const mobilenumber =
        req.body.mobilenumber ||
        req.body.phoneNumber ||
        null;

      const addharcard =
        req.body.addharcard ||
        req.body.aadhaarNumber ||
        req.body.document_id ||
        null;

      const typeofselling =
        req.body.typeofselling ||
        req.body.goldType ||
        null;

      const status =
        req.body.status ||
        currentStatus;

      const street_no =
        req.body.street_no ||
        req.body.streetNo ||
        null;

      const landmark =
        req.body.landmark || null;

      const state =
        req.body.state ||
        req.body.stateName ||
        null;

      const district =
        req.body.district || null;

      const mandal =
        req.body.mandal || null;

      const pincode =
        req.body.pincode || null;

      const result = await pool.query(
        `UPDATE sellergold
         SET
           name = $1,
           category = $2,
           weight = $3,
           purity = $4,
           condition = $5,
           price = $6,
           description = $7,
           images = $8,
           full_name = $9,
           mobilenumber = $10,
           addharcard = $11,
           typeofselling = $12,
           status = $13,
           street_no = $14,
           landmark = $15,
           state = $16,
           district = $17,
           mandal = $18,
           pincode = $19,
           updated_at = NOW()
         WHERE id = $20
         RETURNING *`,
        [
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
          addharcard,
          typeofselling,
          status,
          street_no,
          landmark,
          state,
          district,
          mandal,
          pincode,
          id,
        ]
      );

      return res.status(200).json({
        message:
          "Seller gold product updated successfully",
        data: {
          ...result.rows[0],
          images:
            result.rows[0].images || [],
        },
      });
    } catch (error) {
      console.error(
        "UPDATE SELLER PRODUCT ERROR:",
        error
      );

      return res.status(500).json({
        error:
          "Failed to update seller gold product",
        details: error.message,
      });
    }
  }
);

router.delete(
  "/:id",
  async (req, res) => {
    try {
      const { id } = req.params;

      const result = await pool.query(
        "SELECT images FROM sellergold WHERE id = $1",
        [id]
      );

      if (!result.rows.length) {
        return res.status(404).json({
          error: "Product not found",
        });
      }

      const imagePaths =
        result.rows[0].images || [];

      await Promise.all(
        imagePaths.map(
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
                  "CLOUDINARY DELETE ERROR:",
                  error.message
                );
              }
            }
          }
        )
      );

      await pool.query(
        "DELETE FROM sellergold WHERE id = $1",
        [id]
      );

      return res.status(200).json({
        message:
          "Seller gold product deleted successfully",
      });
    } catch (error) {
      console.error(
        "DELETE SELLER PRODUCT ERROR:",
        error
      );

      return res.status(500).json({
        error:
          "Failed to delete seller gold product",
        details: error.message,
      });
    }
  }
);

module.exports = router;
