const express = require("express");
const router = express.Router();
const twilio = require("twilio");
require("dotenv").config();

// Initialize Twilio client
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const OTP_EXPIRY = 5 * 60 * 1000; // 5 minutes
const RESEND_INTERVAL = 60 * 1000; // 1 minute cooldown

// Temporary in-memory stores
const otpStore = new Map(); // { phone: { otp, expiresAt } }
const lastSendTime = new Map(); // { phone: lastSendTimestamp }

/**
 * Helper function to safely format phone numbers to E.164 format
 */
const formatPhoneNumber = (phone) => {
  const cleaned = phone.replace(/\s+/g, ""); // Remove spaces
  if (cleaned.startsWith("+")) {
    return cleaned;
  }
  // Default to +91 (India) if no country code is provided
  return `+91${cleaned}`;
};

/**
 * 1️⃣ Send OTP
 */
router.post("/send-otp", async (req, res) => {
  let { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone number required" });

  const formattedPhone = formatPhoneNumber(phone.toString());

  // Safety Cooldown check
  const lastSent = lastSendTime.get(formattedPhone);
  if (lastSent && Date.now() - lastSent < RESEND_INTERVAL) {
    const waitSec = Math.ceil((RESEND_INTERVAL - (Date.now() - lastSent)) / 1000);
    return res.status(429).json({ error: `Please wait ${waitSec}s before resending.` });
  }

  // Generate OTP as a standard string
  const otp = Math.floor(100000 + Math.random() * 900000).toString();

  try {
    // FIXED: Swapped 'messagingServiceSid' out for 'from' using your Twilio Phone Number
    await client.messages.create({
      from: process.env.TWILIO_PHONE_NUMBER, 
      body: `Your G Buyer OTP is ${otp}. It will expire in 5 minutes. Please do not share this code with anyone for security reasons. Thank you for using G Buyer! 🛍️`,
      to: formattedPhone,
    });

    otpStore.set(formattedPhone, { otp, expiresAt: Date.now() + OTP_EXPIRY });
    lastSendTime.set(formattedPhone, Date.now());

    return res.status(200).json({ message: `OTP sent successfully to ${formattedPhone}` });
  } catch (error) {
    console.error("Twilio Send Error Context:", error);
    return res.status(500).json({ error: "Failed to send OTP", debug: error.message });
  }
});

/**
 * 2️⃣ Resend OTP
 */
router.post("/resend-otp", async (req, res) => {
  let { phone } = req.body;
  if (!phone) return res.status(400).json({ error: "Phone number required" });

  const formattedPhone = formatPhoneNumber(phone.toString());

  const lastSent = lastSendTime.get(formattedPhone);
  if (lastSent && Date.now() - lastSent < RESEND_INTERVAL) {
    const waitSec = Math.ceil((RESEND_INTERVAL - (Date.now() - lastSent)) / 1000);
    return res.status(429).json({ error: `Please wait ${waitSec}s before resending.` });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  
  try {
    // FIXED: Swapped 'messagingServiceSid' out for 'from' using your Twilio Phone Number
    await client.messages.create({
      from: process.env.TWILIO_PHONE_NUMBER,
      body: `Your new verification code is ${otp}. It will expire in 5 minutes.`,
      to: formattedPhone,
    });

    otpStore.set(formattedPhone, { otp, expiresAt: Date.now() + OTP_EXPIRY });
    lastSendTime.set(formattedPhone, Date.now());

    return res.status(200).json({ message: `New OTP resent to ${formattedPhone}` });
  } catch (error) {
    console.error("Twilio Resend Error Context:", error);
    return res.status(500).json({ error: "Failed to resend OTP", debug: error.message });
  }
});

/**
 * 3️⃣ Verify OTP
 */
router.post("/verify-otp", async (req, res) => {
  let { phone, otp } = req.body;
  if (!phone || !otp) return res.status(400).json({ error: "Phone and OTP are required" });

  const formattedPhone = formatPhoneNumber(phone.toString());
  const record = otpStore.get(formattedPhone);

  if (!record) return res.status(400).json({ error: "OTP not requested or expired" });

  if (Date.now() > record.expiresAt) {
    otpStore.delete(formattedPhone);
    return res.status(400).json({ error: "OTP expired" });
  }

  // Safe type-matching evaluation
  if (record.otp !== otp.toString().trim()) {
    return res.status(400).json({ error: "Invalid OTP" });
  }

  // Clear data after successful verification
  otpStore.delete(formattedPhone);
  return res.status(200).json({ message: "OTP verified successfully" });
});

module.exports = router;
