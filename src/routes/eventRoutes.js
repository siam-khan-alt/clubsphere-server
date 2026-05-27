const express = require("express");
const router = express.Router();
const {
  getPublicEvents,
  getEventById,
  createEventPaymentSession,
  registerForEvent,
  checkEventRegistrationStatus,
  getMemberEvents,
} = require("../controllers/eventController");
const { verifyToken, verifyMember } = require("../middleware/authMiddleware");

// Public routes (specific routes first, then dynamic)
router.get("/", getPublicEvents);

// Member routes (specific routes before dynamic)
router.get("/member/events", verifyToken, verifyMember, getMemberEvents);
router.get("/member/event-registration-status/:eventId", verifyToken, verifyMember, checkEventRegistrationStatus);
router.post("/event-payment/create-checkout-session", verifyToken, verifyMember, createEventPaymentSession);
router.post("/events/register/:eventId", verifyToken, verifyMember, registerForEvent);

// Dynamic routes (must be last)
router.get("/:id", getEventById);

module.exports = router;
