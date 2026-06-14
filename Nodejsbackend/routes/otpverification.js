const express = require("express");
const router = express.Router();
const twilio = require("twilio");
require("dotenv").config();

const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const OTP_EXPIRY = 5 * 60 * 1000; // 5 minutes
const RESEND_INTERVAL = 60 * 1000; // 1 minute cooldown

// Temporary in-memory stores
const otpStore = new Map(); // { phone: { otp, expiresAt } }
const lastSendTime = new Map(); // { phone: lastSendTimestamp }

/**
 * 1️⃣ Send OTP
 */
router.post("/send-otp", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone number required" });

  // Safety Cooldown check added to prevent fast spamming on initial endpoint
  const lastSent = lastSendTime.get(phone);
  if (lastSent && Date.now() - lastSent < RESEND_INTERVAL) {
    const waitSec = Math.ceil((RESEND_INTERVAL - (Date.now() - lastSent)) / 1000);
    return res.status(429).json({ error: `Please wait ${waitSec}s before resending.` });
  }

  // Generate OTP as a standard string to avoid zero-dropping evaluation traps
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    await client.messages.create({
      messagingServiceSid: process.env.TWILIO_MSG_SERVICE_SID,
      body: `Your G Buyer OTP is ${otp}. It will expire in 5 minutes. Please do not share this code with anyone for security reasons. Thank you for using G Buyer! 🛍️`,
      to: `+91${phone}`,
    });

    otpStore.set(phone, { otp, expiresAt: Date.now() + OTP_EXPIRY });
    lastSendTime.set(phone, Date.now());

    return res.status(200).json({ message: `OTP sent to +91${phone}` });
  } catch (error) {
    console.error("Twilio Send Error Context:", error.message);
    return res.status(500).json({ error: "Failed to send OTP", debug: error.message });
  }
});

/**
 * 2️⃣ Resend OTP (FIXED: Standardized parameters)
 */
router.post("/resend-otp", async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone number required" });

  const lastSent = lastSendTime.get(phone);
  if (lastSent && Date.now() - lastSent < RESEND_INTERVAL) {
    const waitSec = Math.ceil((RESEND_INTERVAL - (Date.now() - lastSent)) / 1000);
    return res.status(429).json({ error: `Please wait ${waitSec}s before resending.` });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  
  try {
    // FIXED: Swapped 'from' parameter out for 'messagingServiceSid' to ensure consistent Twilio verification routing
    await client.messages.create({
      messagingServiceSid: process.env.TWILIO_MSG_SERVICE_SID,
      body: `Your new verification code is ${otp}. It will expire in 5 minutes.`,
      to: `+91${phone}`,
    });

    otpStore.set(phone, { otp, expiresAt: Date.now() + OTP_EXPIRY });
    lastSendTime.set(phone, Date.now());

    return res.status(200).json({ message: `New OTP resent to +91${phone}` });
  } catch (error) {
    console.error("Twilio Resend Error Context:", error.message);
    return res.status(500).json({ error: "Failed to resend OTP", debug: error.message });
  }
});

/**
 * 3️⃣ Verify OTP (FIXED: Safe type matching)
 */
router.post("/verify-otp", async (req, res) => {
  const { phone, otp } = req.body;
  if (!phone || !otp) return res.status(400).json({ error: "Phone and OTP are required" });

  const record = otpStore.get(phone);
  if (!record) return res.status(400).json({ error: "OTP not requested or expired" });

  if (Date.now() > record.expiresAt) {
    otpStore.delete(phone);
    return res.status(400).json({ error: "OTP expired" });
  }

  // FIXED: Converted comparison cleanly to matching trimmed strings 
  // to avoid JS type-casting mismatches on inputs
  if (record.otp !== otp.toString().trim()) {
    return res.status(400).json({ error: "Invalid OTP" });
  }

  otpStore.delete(phone);
  return res.status(200).json({ message: "OTP verified successfully" });
});

module.exports = router;
