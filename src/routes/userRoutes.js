const express = require("express");
const router = express.Router();
const {
  registerUser,
  googleLogin,
  updateUser,
  getUserRole,
  getAllUsers,
  updateUserRole,
  deleteUser,
  getMemberStatsAndUpcomingEvents,
} = require("../controllers/userController");
const { verifyToken, verifyAdmin, verifyMember } = require("../middleware/authMiddleware");

// Public routes
router.post("/register", registerUser);
router.post("/google-login", googleLogin);

// Authenticated routes
router.patch("/update", verifyToken, updateUser);
router.get("/role", verifyToken, getUserRole);

// Member only routes
router.get("/member/stats-and-upcoming-events", verifyToken, verifyMember, getMemberStatsAndUpcomingEvents);

// Admin only routes
router.get("/", verifyToken, verifyAdmin, getAllUsers);
router.patch("/role/:email", verifyToken, verifyAdmin, updateUserRole);
router.delete("/:email", verifyToken, verifyAdmin, deleteUser);

module.exports = router;
