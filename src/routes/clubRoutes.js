const express = require("express");
const router = express.Router();
const {
  getPublicClubs,
  getFeaturedClubs,
  getClubById,
  joinClub,
  getMemberClubs,
  getPopularClubs,
} = require("../controllers/clubController");
const { verifyToken, verifyMember } = require("../middleware/authMiddleware");

// Public routes (specific routes first, then dynamic)
router.get("/", getPublicClubs);
router.get("/featuredClubs", getFeaturedClubs);
router.get("/popular-clubsManagers", getPopularClubs);

// Member routes (specific routes before dynamic)
router.get("/member/clubs", verifyToken, verifyMember, getMemberClubs);
router.post("/join/:id", verifyToken, verifyMember, joinClub);

// Dynamic routes (must be last)
router.get("/:id", getClubById);

module.exports = router;
