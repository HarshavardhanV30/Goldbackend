const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

pool.query("SELECT NOW()", (err, result) => {
  if (err) {
    console.error("❌ DATABASE CONNECTION FAILED:", err.message);
  } else {
    console.log("✅ DATABASE CONNECTED:", result.rows[0]);
  }
});

module.exports = pool;
