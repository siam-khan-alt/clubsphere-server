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
const { userSchemas, clubSchemas, querySchemas } = require("../validators/schemas");

// Stats route
router.get("/stats", verifyToken, verifyAdmin, validateRequest(querySchemas.getStats), getAdminStats);

// User management routes
router.get("/users", verifyToken, verifyAdmin, validateRequest(querySchemas.getAllUsers), getAllUsers);
router.patch("/users/role/:email", verifyToken, verifyAdmin, validateRequest(userSchemas.updateRole), updateUserRole);
router.delete("/users/:email", verifyToken, verifyAdmin, validateRequest(userSchemas.deleteUser), deleteUser);

// Club management routes
router.get("/clubs", verifyToken, verifyAdmin, validateRequest(querySchemas.getAdminClubs), getAdminClubs);
router.patch("/clubs/status/:clubId", verifyToken, verifyAdmin, validateRequest(clubSchemas.updateClubStatus), updateClubStatus);
router.delete("/clubs/:clubId", verifyToken, verifyAdmin, validateRequest(clubSchemas.deleteClub), deleteAdminClub);

// Payment management routes
router.get("/payments", verifyToken, verifyAdmin, validateRequest(querySchemas.getAdminPayments), getAdminPayments);

module.exports = router;
