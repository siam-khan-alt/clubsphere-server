const express = require("express");
const router = express.Router();
const {
  createMembershipCheckoutSession,
  handleStripeWebhook,
  getMemberPayments,
  verifyPaymentSuccess,
} = require("../controllers/paymentController");
const { verifyToken, verifyMember } = require("../middleware/authMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { paymentSchemas } = require("../validators/schemas");

// Membership payment routes
router.post(
  "/membership-payment/create-checkout-session",
  verifyToken,
  verifyMember,
  validateRequest(paymentSchemas.createMembershipPayment),
  createMembershipCheckoutSession
);

// Member payment history
router.get("/member/payments", verifyToken, verifyMember, getMemberPayments);

// Payment success verification (public)
router.get("/success", validateRequest(paymentSchemas.verifyPayment), verifyPaymentSuccess);

// Stripe webhook handler (exported separately for raw body parsing)
const webhookRouter = express.Router();
webhookRouter.post("/webhook", handleStripeWebhook);

module.exports = { router, webhookRouter };
