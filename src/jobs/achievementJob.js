const cron = require("node-cron");
const { getCollections } = require("../config");
const { checkAndAwardAchievements, initializeAchievements } = require("../controllers/achievementController");
const logger = require("../config/logger");

/**
 * Start the achievement checking job
 * Runs every hour to check for new achievements
 */
const startAchievementJob = () => {
  // Initialize achievements on startup
  initializeAchievements();

  // Run achievement check every hour
  cron.schedule("0 * * * *", async () => {
    try {
      logger.info("Running achievement check job...");
      const { usersCollection } = getCollections();
      
      // Get all active users
      const users = await usersCollection.find({}).toArray();
      
      let totalNewAchievements = 0;
      
      for (const user of users) {
        const newAchievements = await checkAndAwardAchievements(user.email);
        totalNewAchievements += newAchievements.length;
        
        if (newAchievements.length > 0) {
          logger.info(`User ${user.email} earned ${newAchievements.length} new achievement(s)`);
        }
      }
      
      logger.info(`Achievement check job completed. Total new achievements awarded: ${totalNewAchievements}`);
    } catch (error) {
      logger.error("Error in achievement check job:", error);
    }
  });

  logger.info("Achievement job scheduled to run every hour");
};

module.exports = {
  startAchievementJob,
};
