const express = require("express");
const router = express.Router();
const {
  getPublicEvents,
  getEventById,
  createEventPaymentSession,
  registerForEvent,
  checkEventRegistrationStatus,
  getMemberEvents,
  downloadEventCalendar,
} = require("../controllers/eventController");
const { verifyToken, verifyMember } = require("../middleware/authMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { eventSchemas } = require("../validators/schemas");

// Public routes (specific routes first, then dynamic)
router.get("/", getPublicEvents);

// Member routes (specific routes before dynamic)
router.get("/member/events", verifyToken, verifyMember, getMemberEvents);
router.get("/member/event-registration-status/:eventId", verifyToken, verifyMember, validateRequest(eventSchemas.getEventById), checkEventRegistrationStatus);
router.post("/event-payment/create-checkout-session", verifyToken, verifyMember, validateRequest(eventSchemas.createEventPayment), createEventPaymentSession);
router.post("/events/register/:eventId", verifyToken, verifyMember, validateRequest(eventSchemas.registerForEvent), registerForEvent);

// Calendar download (must be before dynamic :id)
router.get("/:id/calendar", validateRequest(eventSchemas.getEventById), downloadEventCalendar);

// Dynamic routes (must be last)
router.get("/:id", validateRequest(eventSchemas.getEventById), getEventById);

module.exports = router;
