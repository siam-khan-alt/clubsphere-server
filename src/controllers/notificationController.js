const { ObjectId } = require("mongodb");
const { getCollections } = require("../config");
const logger = require("../config/logger");

/**
 * Create a new notification
 * @param {Object} notificationData - Notification data
 * @returns {Promise<Object>} Created notification
 */
const createNotification = async (notificationData) => {
  const { notificationsCollection } = getCollections();
  
  const notification = {
    ...notificationData,
    isRead: false,
    createdAt: new Date(),
  };

  const result = await notificationsCollection.insertOne(notification);
  return { ...notification, _id: result.insertedId };
};

/**
 * Get notifications for a user (Express route handler)
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 */
const getUserNotifications = async (req, res) => {
  try {
    const { notificationsCollection } = getCollections();
    const userEmail = req.user?.email;

    if (!userEmail) {
      return res.status(200).json([]);
    }

    const notifications = await notificationsCollection
      .find({ userEmail })
      .sort({ createdAt: -1 })
      .limit(50)
      .toArray();

    res.status(200).json(notifications);
  } catch (error) {
    logger.error("Error fetching notifications:", error);
    res.status(200).json([]);
  }
};

/**
 * Mark notification as read
 * @param {string} notificationId - Notification ID
 * @returns {Promise<Object>} Update result
 */
const markNotificationAsRead = async (notificationId) => {
  const { notificationsCollection } = getCollections();
  
  const result = await notificationsCollection.updateOne(
    { _id: new ObjectId(notificationId) },
    { $set: { isRead: true, readAt: new Date() } }
  );

  return result;
};

/**
 * Mark all notifications as read for a user
 * @param {string} userEmail - User email
 * @returns {Promise<Object>} Update result
 */
const markAllNotificationsAsRead = async (userEmail) => {
  const { notificationsCollection } = getCollections();
  
  const result = await notificationsCollection.updateMany(
    { userEmail, isRead: false },
    { $set: { isRead: true, readAt: new Date() } }
  );

  return result;
};

/**
 * Delete notification
 * @param {string} notificationId - Notification ID
 * @returns {Promise<Object>} Delete result
 */
const deleteNotification = async (notificationId) => {
  const { notificationsCollection } = getCollections();
  
  const result = await notificationsCollection.deleteOne({
    _id: new ObjectId(notificationId),
  });

  return result;
};

/**
 * Trigger notification when user joins a club
 * @param {string} userEmail - User email
 * @param {string} clubName - Club name
 * @param {string} clubId - Club ID
 */
const notifyClubJoin = async (userEmail, clubName, clubId) => {
  try {
    await createNotification({
      userEmail,
      type: "club_join",
      title: "Club Joined Successfully",
      message: `You have successfully joined ${clubName}.`,
      data: { clubId, clubName },
    });
    logger.info(`Notification sent for club join: ${userEmail} joined ${clubName}`);
  } catch (error) {
    logger.error("Failed to send club join notification:", error);
  }
};

/**
 * Trigger notification when user registers for an event
 * @param {string} userEmail - User email
 * @param {string} eventTitle - Event title
 * @param {string} eventId - Event ID
 * @param {string} eventDate - Event date
 */
const notifyEventRegistration = async (userEmail, eventTitle, eventId, eventDate) => {
  try {
    await createNotification({
      userEmail,
      type: "event_registration",
      title: "Event Registration Confirmed",
      message: `You have successfully registered for ${eventTitle}.`,
      data: { eventId, eventTitle, eventDate },
    });
    logger.info(`Notification sent for event registration: ${userEmail} registered for ${eventTitle}`);
  } catch (error) {
    logger.error("Failed to send event registration notification:", error);
  }
};

/**
 * Trigger notification when membership status changes
 * @param {string} userEmail - User email
 * @param {string} clubName - Club name
 * @param {string} status - New status
 */
const notifyMembershipStatusChange = async (userEmail, clubName, status) => {
  try {
    await createNotification({
      userEmail,
      type: "membership_status",
      title: "Membership Status Updated",
      message: `Your membership for ${clubName} is now ${status}.`,
      data: { clubName, status },
    });
    logger.info(`Notification sent for membership status change: ${userEmail} - ${clubName} - ${status}`);
  } catch (error) {
    logger.error("Failed to send membership status notification:", error);
  }
};

/**
 * Trigger notification for membership expiration reminder
 * @param {string} userEmail - User email
 * @param {string} clubName - Club name
 * @param {string} endDate - Membership end date
 */
const notifyMembershipExpiration = async (userEmail, clubName, endDate) => {
  try {
    await createNotification({
      userEmail,
      type: "membership_expiration",
      title: "Membership Expiring Soon",
      message: `Your membership for ${clubName} will expire on ${endDate}.`,
      data: { clubName, endDate },
    });
    logger.info(`Notification sent for membership expiration: ${userEmail} - ${clubName}`);
  } catch (error) {
    logger.error("Failed to send membership expiration notification:", error);
  }
};

module.exports = {
  createNotification,
  getUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  deleteNotification,
  notifyClubJoin,
  notifyEventRegistration,
  notifyMembershipStatusChange,
  notifyMembershipExpiration,
};
