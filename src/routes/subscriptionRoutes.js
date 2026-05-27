const express = require("express");
const router = express.Router();
const {
  createSubscriptionCheckout,
  handleSubscriptionSuccess,
  getSubscriptionStatus,
  cancelSubscription,
} = require("../controllers/subscriptionController");
const { verifyToken, verifyManager } = require("../middleware/authMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { subscriptionSchemas } = require("../validators/schemas");

// Create subscription checkout session
router.post(
  "/checkout",
  verifyToken,
  verifyManager,
  validateRequest(subscriptionSchemas.createCheckout),
  createSubscriptionCheckout
);

// Handle successful subscription
router.get("/success", handleSubscriptionSuccess);

// Get subscription status
router.get(
  "/status/:clubId",
  verifyToken,
  verifyManager,
  getSubscriptionStatus
);

// Cancel subscription
router.delete(
  "/cancel/:clubId",
  verifyToken,
  verifyManager,
  cancelSubscription
);

module.exports = router;
