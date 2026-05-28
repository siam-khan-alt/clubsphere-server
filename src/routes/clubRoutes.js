const express = require("express");
const router = express.Router();
const {
  getPublicClubs,
  getFeaturedClubs,
  getClubById,
  joinClub,
  leaveClub,
  getMemberClubs,
  getPopularClubs,
} = require("../controllers/clubController");
const { verifyToken, verifyMember } = require("../middleware/authMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { clubSchemas, querySchemas } = require("../validators/schemas");

// Public routes (specific routes first, then dynamic)
router.get("/", validateRequest(querySchemas.search), getPublicClubs);
router.get("/featuredClubs", getFeaturedClubs);
router.get("/popular-clubsManagers", getPopularClubs);

// Member routes (specific routes before dynamic)
router.get("/member/clubs", verifyToken, verifyMember, getMemberClubs);
router.post("/join/:id", verifyToken, verifyMember, validateRequest(clubSchemas.joinClub), joinClub);
router.post("/leave/:id", verifyToken, verifyMember, validateRequest(clubSchemas.leaveClub), leaveClub);

// Dynamic routes (must be last)
router.get("/:id", validateRequest(clubSchemas.getClubById), getClubById);

module.exports = router;
