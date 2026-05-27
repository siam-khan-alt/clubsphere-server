const express = require("express");
const router = express.Router();
const {
  getManagerClubs,
  createClub,
  updateClub,
  deleteClub,
  getClubMembers,
  updateMembershipStatus,
  getManagerStats,
} = require("../controllers/clubController");
const {
  getManagerEvents,
  getEventRegistrations,
  createEvent,
  updateEvent,
  deleteEvent,
} = require("../controllers/eventController");
const { verifyToken, verifyManager } = require("../middleware/authMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { clubSchemas, eventSchemas, paymentSchemas } = require("../validators/schemas");

// Stats route
router.get("/stats", verifyToken, verifyManager, getManagerStats);

// Club management routes
router.get("/clubs", verifyToken, verifyManager, getManagerClubs);
router.post("/clubs", verifyToken, verifyManager, validateRequest(clubSchemas.createClub), createClub);
router.patch("/clubs/:id", verifyToken, verifyManager, validateRequest(clubSchemas.updateClub), updateClub);
router.delete("/clubs/:id", verifyToken, verifyManager, validateRequest(clubSchemas.deleteClub), deleteClub);
router.get("/clubs/:clubId/members", verifyToken, verifyManager, validateRequest(clubSchemas.getClubMembers), getClubMembers);

// Membership management routes
router.patch("/memberships/:memberId", verifyToken, verifyManager, validateRequest(paymentSchemas.updateMembershipStatus), updateMembershipStatus);

// Event management routes
router.get("/events", verifyToken, verifyManager, getManagerEvents);
router.get("/events/:eventId/registrations", verifyToken, verifyManager, validateRequest(eventSchemas.getEventRegistrations), getEventRegistrations);
router.post("/events", verifyToken, verifyManager, validateRequest(eventSchemas.createEvent), createEvent);
router.patch("/events/:id", verifyToken, verifyManager, validateRequest(eventSchemas.updateEvent), updateEvent);
router.delete("/events/:id", verifyToken, verifyManager, validateRequest(eventSchemas.deleteEvent), deleteEvent);

module.exports = router;
