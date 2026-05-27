const express = require("express");
const router = express.Router();
const {
  registerUser,
  googleLogin,
  updateUser,
  getUserRole,
  getMemberStatsAndUpcomingEvents,
} = require("../controllers/userController");
const { verifyToken, verifyMember } = require("../middleware/authMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { userSchemas } = require("../validators/schemas");

// Public routes
router.post("/register", validateRequest(userSchemas.register), registerUser);
router.post("/google-login", validateRequest(userSchemas.googleLogin), googleLogin);

// Authenticated routes
router.patch("/update", verifyToken, validateRequest(userSchemas.updateUser), updateUser);
router.get("/role", verifyToken, getUserRole);

// Member only routes
router.get("/member/stats-and-upcoming-events", verifyToken, verifyMember, getMemberStatsAndUpcomingEvents);

module.exports = router;
