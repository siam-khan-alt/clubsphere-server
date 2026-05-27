const express = require("express");
const router = express.Router();
const {
  getAllAchievements,
  getUserAchievements,
  getUserStats,
} = require("../controllers/achievementController");
const { verifyToken } = require("../middleware/authMiddleware");

// Get all available achievements (public)
router.get("/", getAllAchievements);

// Get user's achievements
router.get("/user", verifyToken, getUserAchievements);

// Get user stats for progress tracking
router.get("/user/stats", verifyToken, getUserStats);

module.exports = router;
