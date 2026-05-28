const express = require("express");
const router = express.Router();
const {
  getUserChatRooms,
  getRoomMessages,
  createDirectRoom,
} = require("../controllers/chatController");
const { verifyToken } = require("../middleware/authMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { chatSchemas } = require("../validators/schemas");

// Get all chat rooms for the current user
router.get("/rooms", verifyToken, getUserChatRooms);

// Get messages for a specific room
router.get(
  "/rooms/:roomId/messages",
  verifyToken,
  validateRequest(chatSchemas.getRoomMessages),
  getRoomMessages
);

// Create or get direct message room
router.post(
  "/rooms/direct",
  verifyToken,
  validateRequest(chatSchemas.createDirectRoom),
  createDirectRoom
);

module.exports = router;
