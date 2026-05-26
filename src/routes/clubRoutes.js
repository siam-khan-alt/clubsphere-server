const express = require("express");
const router = express.Router();
const {
  createClub,
  getAdminClubs,
  updateClubStatus,
  deleteAdminClub,
  getPopularClubs,
  getManagerClubs,
  updateClub,
  deleteClub,
  getPublicClubs,
  getFeaturedClubs,
  getClubById,
  joinClub,
} = require("../controllers/clubController");
const { verifyToken, verifyAdmin, verifyManager, verifyMember } = require("../middleware/authMiddleware");

// Public routes (specific routes first, then dynamic)
router.get("/", getPublicClubs);
router.get("/featuredClubs", getFeaturedClubs);
router.get("/popular-clubsManagers", getPopularClubs);

// Manager routes (specific routes before dynamic)
router.post("/", verifyToken, verifyManager, createClub);
router.get("/manager/clubs", verifyToken, verifyManager, getManagerClubs);

// Admin routes (specific routes before dynamic)
router.get("/admin/clubs", verifyToken, verifyAdmin, getAdminClubs);
router.patch("/admin/clubs/status/:clubId", verifyToken, verifyAdmin, updateClubStatus);
router.delete("/admin/clubs/:clubId", verifyToken, verifyAdmin, deleteAdminClub);

// Member routes (specific routes before dynamic)
router.post("/join/:id", verifyToken, verifyMember, joinClub);

// Dynamic routes (must be last)
router.get("/:id", getClubById);
router.patch("/:id", verifyToken, verifyManager, updateClub);
router.delete("/:id", verifyToken, verifyManager, deleteClub);

module.exports = router;
