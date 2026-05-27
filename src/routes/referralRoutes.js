const express = require("express");
const router = express.Router();
const {
  getReferralCode,
  trackReferralSignup,
  allocateReferralCredits,
  getReferralStats,
} = require("../controllers/referralController");
const { verifyToken } = require("../middleware/authMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { referralSchemas } = require("../validators/schemas");

// Get or create referral code
router.get("/code", verifyToken, getReferralCode);

// Track referral sign-up
router.post("/track", verifyToken, validateRequest(referralSchemas.trackSignup), trackReferralSignup);

// Allocate referral credits (called after first payment)
router.post("/allocate-credits", verifyToken, validateRequest(referralSchemas.allocateCredits), allocateReferralCredits);

// Get referral stats
router.get("/stats", verifyToken, getReferralStats);

module.exports = router;
