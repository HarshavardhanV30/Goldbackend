const express = require("express");
const router = express.Router();
const twilio = require("twilio");
require("dotenv").config();

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
console.log(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const OTP_EXPIRY = 5 * 60 * 1000; // 5 minutes

// Temporary in-memory OTP store (auto clears on server restart)
const otpStore = new Map();

/**
 * 1️⃣ Send OTP
 */
router.post("/send-otp", async (req, res) => {
  const { phone } = req.body;

  if (!phone) {
    return res.status(400).json({ error: "Phone number required" });
  }

  const otp = Math.floor(100000 + Math.random() * 900000); // 6-digit OTP

  try {
    // Send OTP via Twilio
    await client.messages.create({
      body: `Your verification code is ${otp}`,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: `+91${phone}`,
    });

    // Save OTP temporarily (no DB)
    otpStore.set(phone, { otp, expiresAt: Date.now() + OTP_EXPIRY });

    res.status(200).json({ message: `OTP sent to +91${phone}` });
  } catch (error) {
    console.error("Twilio Error:", error);
    res.status(500).json({ error: "Failed to send OTP" });
  }
});

/**
 * 2️⃣ Verify OTP
 */
router.post("/verify-otp", async (req, res) => {
  const { phone, otp } = req.body;

  if (!phone || !otp) {
    return res.status(400).json({ error: "Phone and OTP are required" });
  }

  const record = otpStore.get(phone);

  if (!record) {
    return res.status(400).json({ error: "OTP not requested or expired" });
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(phone);
    return res.status(400).json({ error: "OTP expired" });
  }

  if (record.otp !== parseInt(otp)) {
    return res.status(400).json({ error: "Invalid OTP" });
  }

  // ✅ OTP valid — remove from memory
  otpStore.delete(phone);

  res.status(200).json({ message: "OTP verified successfully" });
});

module.exports = router;
