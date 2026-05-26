const express = require("express");
const router = express.Router();
const {
  getManagerEvents,
  getEventRegistrations,
  createEvent,
  updateEvent,
  deleteEvent,
  getPublicEvents,
  getEventById,
  createEventPaymentSession,
  registerForEvent,
} = require("../controllers/eventController");
const { verifyToken, verifyManager, verifyMember } = require("../middleware/authMiddleware");

// Public routes (specific routes first, then dynamic)
router.get("/", getPublicEvents);

// Manager routes (specific routes before dynamic)
router.get("/manager/events", verifyToken, verifyManager, getManagerEvents);
router.get("/manager/events/:eventId/registrations", verifyToken, verifyManager, getEventRegistrations);
router.post("/manager/events", verifyToken, verifyManager, createEvent);
router.patch("/manager/events/:id", verifyToken, verifyManager, updateEvent);
router.delete("/manager/events/:id", verifyToken, verifyManager, deleteEvent);

// Member routes (specific routes before dynamic)
router.post("/event-payment/create-checkout-session", verifyToken, verifyMember, createEventPaymentSession);
router.post("/events/register/:eventId", verifyToken, verifyMember, registerForEvent);

// Dynamic routes (must be last)
router.get("/:id", getEventById);

module.exports = router;
