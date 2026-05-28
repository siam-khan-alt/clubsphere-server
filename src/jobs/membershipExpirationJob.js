const cron = require("node-cron");
const { getCollections, startSession } = require("../config");
const logger = require("../config/logger");
const { notifyMembershipExpiration } = require("../controllers/notificationController");
const emailService = require("../utils/emailService");

/**
 * Check for expiring memberships and send reminders
 * Runs daily at 9:00 AM
 */
const checkExpiringMemberships = async () => {
  try {
    logger.info("Checking for expiring memberships...");
    const { membershipsCollection, clubsCollection, usersCollection } = getCollections();

    // Calculate dates
    const today = new Date();
    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(today.getDate() + 3);

    const oneDayFromNow = new Date(today);
    oneDayFromNow.setDate(today.getDate() + 1);

    // Find memberships expiring in 3 days
    const expiringIn3Days = await membershipsCollection
      .find({
        status: "active",
        endDate: {
          $gte: threeDaysFromNow,
          $lt: new Date(threeDaysFromNow.getTime() + 24 * 60 * 60 * 1000),
        },
      })
      .toArray();

    // Find memberships expiring in 1 day
    const expiringIn1Day = await membershipsCollection
      .find({
        status: "active",
        endDate: {
          $gte: oneDayFromNow,
          $lt: new Date(oneDayFromNow.getTime() + 24 * 60 * 60 * 1000),
        },
      })
      .toArray();

    // Find expired memberships that are still active
    const expiredMemberships = await membershipsCollection
      .find({
        status: "active",
        endDate: { $lt: today },
      })
      .toArray();

    // Process expiring in 3 days
    for (const membership of expiringIn3Days) {
      try {
        const club = await clubsCollection.findOne({
          _id: membership.clubId,
        });

        if (club) {
          const endDate = membership.endDate.toISOString().split("T")[0];
          
          // Send notification
          await notifyMembershipExpiration(
            membership.userEmail,
            club.clubName,
            endDate
          );

          // Send email
          await emailService.sendExpirationReminderEmail(
            membership.userEmail,
            membership.userEmail.split("@")[0],
            club.clubName,
            endDate
          );

          logger.info(
            `Sent 3-day expiration reminder to ${membership.userEmail} for ${club.clubName}`
          );
        }
      } catch (error) {
        logger.error(
          `Failed to send 3-day reminder for ${membership.userEmail}:`,
          error
        );
      }
    }

    // Process expiring in 1 day
    for (const membership of expiringIn1Day) {
      try {
        const club = await clubsCollection.findOne({
          _id: membership.clubId,
        });

        if (club) {
          const endDate = membership.endDate.toISOString().split("T")[0];
          
          // Send notification
          await notifyMembershipExpiration(
            membership.userEmail,
            club.clubName,
            endDate
          );

          // Send email
          await emailService.sendExpirationReminderEmail(
            membership.userEmail,
            membership.userEmail.split("@")[0],
            club.clubName,
            endDate
          );

          logger.info(
            `Sent 1-day expiration reminder to ${membership.userEmail} for ${club.clubName}`
          );
        }
      } catch (error) {
        logger.error(
          `Failed to send 1-day reminder for ${membership.userEmail}:`,
          error
        );
      }
    }

    // Process expired memberships
    for (const membership of expiredMemberships) {
      try {
        const club = await clubsCollection.findOne({
          _id: membership.clubId,
        });

        if (club) {
          // Wrap membership status update and club members array removal in transaction
          const dbSession = await startSession();
          try {
            await dbSession.withTransaction(async () => {
              // Update membership status to expired
              await membershipsCollection.updateOne(
                { _id: membership._id },
                { $set: { status: "expired", updatedAt: new Date() } },
                { session: dbSession }
              );

              // Remove user from club's members array to maintain data consistency
              await clubsCollection.updateOne(
                { _id: membership.clubId },
                { $pull: { members: membership.userEmail } },
                { session: dbSession }
              );
            });
          } finally {
            await dbSession.endSession();
          }

          // Send notification
          await notifyMembershipExpiration(
            membership.userEmail,
            club.clubName,
            membership.endDate.toISOString().split("T")[0]
          );

          // Send email
          await emailService.sendMembershipStatusEmail(
            membership.userEmail,
            membership.userEmail.split("@")[0],
            club.clubName,
            "expired",
            membership.endDate.toISOString().split("T")[0]
          );

          logger.info(
            `Expired membership for ${membership.userEmail} in ${club.clubName} and removed from members array`
          );
        }
      } catch (error) {
        logger.error(
          `Failed to expire membership for ${membership.userEmail}:`,
          error
        );
      }
    }

    logger.info("Membership expiration check completed");
  } catch (error) {
    logger.error("Error in membership expiration job:", error);
  }
};

/**
 * Start the membership expiration job
 * Runs daily at 9:00 AM
 */
const startMembershipExpirationJob = () => {
  // Run every day at 9:00 AM
  cron.schedule("0 9 * * *", () => {
    logger.info("Running membership expiration job...");
    checkExpiringMemberships();
  });

  logger.info("Membership expiration job scheduled to run daily at 9:00 AM");
};

module.exports = {
  checkExpiringMemberships,
  startMembershipExpirationJob,
};
