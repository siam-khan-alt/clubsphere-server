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

// Public routes
router.post("/register", registerUser);
router.post("/google-login", googleLogin);

// Authenticated routes
router.patch("/update", verifyToken, updateUser);
router.get("/role", verifyToken, getUserRole);

// Member only routes
router.get("/member/stats-and-upcoming-events", verifyToken, verifyMember, getMemberStatsAndUpcomingEvents);

module.exports = router;
