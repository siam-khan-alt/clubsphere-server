const { ObjectId } = require("mongodb");
const { getCollections, stripe } = require("../config");
const logger = require("../config/logger");

/**
 * Cascade Delete Service
 * Handles cascade deletions with MongoDB transactions to ensure data integrity
 */

/**
 * Delete a club and all related records atomically
 * @param {string} clubId - The ID of the club to delete
 * @param {object} session - MongoDB session for transactions
 * @returns {Promise<object>} Result of the deletion
 */
const deleteClubCascade = async (clubId, session = null) => {
  const {
    clubsCollection,
    membershipsCollection,
    eventsCollection,
    eventRegistrationsCollection,
    notificationsCollection,
    paymentsCollection,
  } = getCollections();

  try {
    // Get club details first to check for Stripe subscription
    const club = await clubsCollection.findOne(
      { _id: new ObjectId(clubId) },
      { session }
    );

    if (!club) {
      throw new Error("Club not found");
    }

    // Cancel Stripe subscription if exists
    if (club.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(club.stripeSubscriptionId);
        logger.info(`Cancelled Stripe subscription ${club.stripeSubscriptionId} for club ${clubId}`);
      } catch (stripeError) {
        logger.error(`Failed to cancel Stripe subscription for club ${clubId}:`, stripeError);
        // Continue with deletion even if Stripe cancellation fails
      }
    }

    // Get all events for this club to delete registrations
    const events = await eventsCollection
      .find({ clubId: clubId }, { projection: { _id: 1 } })
      .toArray();

    const eventIds = events.map((e) => e._id);

    // Delete event registrations for all events
    if (eventIds.length > 0) {
      await eventRegistrationsCollection.deleteMany(
        { eventId: { $in: eventIds } },
        { session }
      );
    }

    // Delete payments related to this club's events
    if (eventIds.length > 0) {
      await paymentsCollection.deleteMany(
        { eventId: { $in: eventIds } },
        { session }
      );
    }

    // Delete events
    await eventsCollection.deleteMany({ clubId: clubId }, { session });

    // Delete memberships
    await membershipsCollection.deleteMany({ clubId: clubId }, { session });

    // Delete payments related to club memberships
    await paymentsCollection.deleteMany(
      { clubId: clubId, type: "membership" },
      { session }
    );

    // Delete notifications
    await notificationsCollection.deleteMany({ clubId: clubId }, { session });

    // Delete the club
    const result = await clubsCollection.deleteOne(
      { _id: new ObjectId(clubId) },
      { session }
    );

    logger.info(`Cascade deleted club ${clubId} and all related records`);
    return {
      success: true,
      deletedCount: result.deletedCount,
      eventsDeleted: eventIds.length,
    };
  } catch (error) {
    logger.error(`Error in cascade delete club ${clubId}:`, error);
    throw error;
  }
};

/**
 * Delete a user and all related records atomically
 * @param {string} userEmail - The email of the user to delete
 * @param {object} session - MongoDB session for transactions
 * @returns {Promise<object>} Result of the deletion
 */
const deleteUserCascade = async (userEmail, session = null) => {
  const {
    usersCollection,
    membershipsCollection,
    eventRegistrationsCollection,
    paymentsCollection,
    referralsCollection,
    userAchievementsCollection,
    notificationsCollection,
  } = getCollections();

  try {
    // Check if user exists
    const user = await usersCollection.findOne(
      { email: userEmail },
      { session }
    );

    if (!user) {
      throw new Error("User not found");
    }

    // Get user's memberships to update club member counts
    const memberships = await membershipsCollection
      .find({ userEmail: userEmail }, { projection: { clubId: 1 } })
      .toArray();

    const clubIds = memberships.map((m) => m.clubId);

    // Remove user from club members arrays
    if (clubIds.length > 0) {
      await membershipsCollection.deleteMany(
        { userEmail: userEmail },
        { session }
      );
    }

    // Delete event registrations
    await eventRegistrationsCollection.deleteMany(
      { userEmail: userEmail },
      { session }
    );

    // Delete payments
    await paymentsCollection.deleteMany({ userEmail: userEmail }, { session });

    // Delete referral record (as inviter)
    await referralsCollection.deleteOne({ inviterEmail: userEmail }, { session });

    // Remove user from referral invitedUsers arrays (as invited user)
    await referralsCollection.updateMany(
      { "invitedUsers.email": userEmail },
      { $pull: { invitedUsers: { email: userEmail } } },
      { session }
    );

    // Delete user achievements
    await userAchievementsCollection.deleteMany(
      { userEmail: userEmail },
      { session }
    );

    // Delete notifications
    await notificationsCollection.deleteMany({ userEmail: userEmail }, { session });

    // Delete the user
    const result = await usersCollection.deleteOne(
      { email: userEmail },
      { session }
    );

    logger.info(`Cascade deleted user ${userEmail} and all related records`);
    return {
      success: true,
      deletedCount: result.deletedCount,
      membershipsDeleted: memberships.length,
    };
  } catch (error) {
    logger.error(`Error in cascade delete user ${userEmail}:`, error);
    throw error;
  }
};

/**
 * Delete an event and all related records atomically
 * @param {string} eventId - The ID of the event to delete
 * @param {object} session - MongoDB session for transactions
 * @returns {Promise<object>} Result of the deletion
 */
const deleteEventCascade = async (eventId, session = null) => {
  const {
    eventsCollection,
    eventRegistrationsCollection,
    paymentsCollection,
    notificationsCollection,
    clubsCollection,
  } = getCollections();

  try {
    // Get event details first
    const event = await eventsCollection.findOne(
      { _id: new ObjectId(eventId) },
      { session }
    );

    if (!event) {
      throw new Error("Event not found");
    }

    const clubId = event.clubId;

    // Delete event registrations
    await eventRegistrationsCollection.deleteMany(
      { eventId: eventId },
      { session }
    );

    // Delete payments related to this event
    await paymentsCollection.deleteMany(
      { eventId: eventId },
      { session }
    );

    // Delete notifications
    await notificationsCollection.deleteMany({ eventId: eventId }, { session });

    // Delete the event
    const result = await eventsCollection.deleteOne(
      { _id: new ObjectId(eventId) },
      { session }
    );

    // Decrement club's event count
    await clubsCollection.updateOne(
      { _id: new ObjectId(clubId) },
      { $inc: { eventsCount: -1 } },
      { session }
    );

    logger.info(`Cascade deleted event ${eventId} and all related records`);
    return {
      success: true,
      deletedCount: result.deletedCount,
    };
  } catch (error) {
    logger.error(`Error in cascade delete event ${eventId}:`, error);
    throw error;
  }
};

module.exports = {
  deleteClubCascade,
  deleteUserCascade,
  deleteEventCascade,
};
