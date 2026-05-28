const express = require("express");
const router = express.Router();
const {
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
} = require("../controllers/notificationController");
const { verifyToken } = require("../middleware/authMiddleware");
const validateRequest = require("../middleware/validateRequest");
const { notificationSchemas } = require("../validators/schemas");

// Get user notifications
router.get("/", verifyToken, getUserNotifications);

// Mark notification as read
router.patch(
  "/:notificationId/read",
  verifyToken,
  validateRequest(notificationSchemas.markAsRead),
  markNotificationAsRead
);

// Mark all notifications as read
router.patch("/read-all", verifyToken, markAllNotificationsAsRead);

// Delete notification
router.delete(
  "/:notificationId",
  verifyToken,
  validateRequest(notificationSchemas.deleteNotification),
  deleteNotification
);

module.exports = router;
