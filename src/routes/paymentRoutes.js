const express = require("express");
const router = express.Router();
const {
  createMembershipCheckoutSession,
  handleStripeWebhook,
} = require("../controllers/paymentController");
const { verifyToken, verifyMember } = require("../middleware/authMiddleware");

// Membership payment routes
router.post(
  "/membership-payment/create-checkout-session",
  verifyToken,
  verifyMember,
  createMembershipCheckoutSession
);

// Stripe webhook handler (exported separately for raw body parsing)
const webhookRouter = express.Router();
webhookRouter.post("/webhook", handleStripeWebhook);

module.exports = { router, webhookRouter };
