const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  keepAlive: true,
});

pool.on("connect", () => {
  console.log("✅ PostgreSQL connected");
});

pool.on("error", (err) => {
  console.error("❌ PostgreSQL pool error:", err.message);
});

pool.query("SELECT NOW()", (err, result) => {
  if (err) {
    console.error("❌ DATABASE ERROR:", err.message);
  } else {
    console.log("✅ DATABASE TEST:", result.rows[0]);
  }
});

module.exports = pool;
