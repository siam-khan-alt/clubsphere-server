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

// Stats route
router.get("/stats", verifyToken, verifyManager, getManagerStats);

// Club management routes
router.get("/clubs", verifyToken, verifyManager, getManagerClubs);
router.post("/clubs", verifyToken, verifyManager, createClub);
router.patch("/clubs/:id", verifyToken, verifyManager, updateClub);
router.delete("/clubs/:id", verifyToken, verifyManager, deleteClub);
router.get("/clubs/:clubId/members", verifyToken, verifyManager, getClubMembers);

// Membership management routes
router.patch("/memberships/:memberId", verifyToken, verifyManager, updateMembershipStatus);

// Event management routes
router.get("/events", verifyToken, verifyManager, getManagerEvents);
router.get("/events/:eventId/registrations", verifyToken, verifyManager, getEventRegistrations);
router.post("/events", verifyToken, verifyManager, createEvent);
router.patch("/events/:id", verifyToken, verifyManager, updateEvent);
router.delete("/events/:id", verifyToken, verifyManager, deleteEvent);

module.exports = router;
