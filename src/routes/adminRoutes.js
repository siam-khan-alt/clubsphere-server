const express = require("express");
const router = express.Router();
const {
  getAllUsers,
  updateUserRole,
  deleteUser,
  getAdminStats,
} = require("../controllers/userController");
const {
  getAdminClubs,
  updateClubStatus,
  deleteAdminClub,
} = require("../controllers/clubController");
const {
  getAdminPayments,
} = require("../controllers/paymentController");
const { verifyToken, verifyAdmin } = require("../middleware/authMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { userSchemas, clubSchemas } = require("../validators/schemas");

// Stats route
router.get("/stats", verifyToken, verifyAdmin, getAdminStats);

// User management routes
router.get("/users", verifyToken, verifyAdmin, getAllUsers);
router.patch("/users/role/:email", verifyToken, verifyAdmin, validateRequest(userSchemas.updateRole), updateUserRole);
router.delete("/users/:email", verifyToken, verifyAdmin, validateRequest(userSchemas.deleteUser), deleteUser);

// Club management routes
router.get("/clubs", verifyToken, verifyAdmin, getAdminClubs);
router.patch("/clubs/status/:clubId", verifyToken, verifyAdmin, validateRequest(clubSchemas.updateClubStatus), updateClubStatus);
router.delete("/clubs/:clubId", verifyToken, verifyAdmin, validateRequest(clubSchemas.deleteClub), deleteAdminClub);

// Payment management routes
router.get("/payments", verifyToken, verifyAdmin, getAdminPayments);

module.exports = router;
