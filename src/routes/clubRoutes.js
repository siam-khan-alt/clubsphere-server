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
  getClubComments,
  addClubComment,
  toggleCommentReaction,
  editClubComment,
  deleteClubComment,
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

// Comment routes
router.get("/:id/comments", validateRequest(clubSchemas.getClubComments), getClubComments);
router.post("/:id/comments", verifyToken, validateRequest(clubSchemas.addClubComment), addClubComment);
router.post("/:id/comments/:commentId/react", verifyToken, validateRequest(clubSchemas.toggleCommentReaction), toggleCommentReaction);
router.patch("/:id/comments/:commentId", verifyToken, validateRequest(clubSchemas.editClubComment), editClubComment);
router.delete("/:id/comments/:commentId", verifyToken, validateRequest(clubSchemas.deleteClubComment), deleteClubComment);

// Dynamic routes (must be last)
router.get("/:id", validateRequest(clubSchemas.getClubById), getClubById);

module.exports = router;
