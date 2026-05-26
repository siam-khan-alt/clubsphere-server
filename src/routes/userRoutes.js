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
} = require("../controllers/userController");
const { verifyToken, verifyAdmin } = require("../middleware/authMiddleware");

// Public routes
router.post("/register", registerUser);
router.post("/google-login", googleLogin);

// Authenticated routes
router.patch("/update", verifyToken, updateUser);
router.get("/role", verifyToken, getUserRole);

// Admin only routes
router.get("/", verifyToken, verifyAdmin, getAllUsers);
router.patch("/role/:email", verifyToken, verifyAdmin, updateUserRole);
router.delete("/:email", verifyToken, verifyAdmin, deleteUser);

module.exports = router;
