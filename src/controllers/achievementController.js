const { ObjectId } = require("mongodb");
const { getCollections } = require("../config");
const logger = require("../config/logger");

/**
 * Initialize default achievements
 */
const initializeAchievements = async () => {
  try {
    const { achievementsCollection } = getCollections();

    const defaultAchievements = [
      {
        id: "first_club_join",
        name: "Club Pioneer",
        description: "Join your first club",
        icon: "🏆",
        type: "membership",
        condition: { field: "clubJoinCount", value: 1 },
        points: 10,
        createdAt: new Date(),
      },
      {
        id: "club_enthusiast",
        name: "Club Enthusiast",
        description: "Join 5 different clubs",
        icon: "🎯",
        type: "membership",
        condition: { field: "clubJoinCount", value: 5 },
        points: 50,
        createdAt: new Date(),
      },
      {
        id: "event_pioneer",
        name: "Event Pioneer",
        description: "Register for your first event",
        icon: "🎪",
        type: "event",
        condition: { field: "eventRegistrationCount", value: 1 },
        points: 15,
        createdAt: new Date(),
      },
      {
        id: "event_enthusiast",
        name: "Event Enthusiast",
        description: "Register for 5 events",
        icon: "🎉",
        type: "event",
        condition: { field: "eventRegistrationCount", value: 5 },
        points: 75,
        createdAt: new Date(),
      },
      {
        id: "first_payment",
        name: "First Contribution",
        description: "Make your first payment",
        icon: "💳",
        type: "payment",
        condition: { field: "paymentCount", value: 1 },
        points: 20,
        createdAt: new Date(),
      },
      {
        id: "loyal_member",
        name: "Loyal Member",
        description: "Maintain active membership for 30 days",
        icon: "⭐",
        type: "loyalty",
        condition: { field: "membershipDays", value: 30 },
        points: 100,
        createdAt: new Date(),
      },
      {
        id: "referral_starter",
        name: "Referral Starter",
        description: "Refer 1 friend who joins",
        icon: "🤝",
        type: "referral",
        condition: { field: "successfulReferrals", value: 1 },
        points: 30,
        createdAt: new Date(),
      },
      {
        id: "referral_master",
        name: "Referral Master",
        description: "Refer 5 friends who join",
        icon: "🌟",
        type: "referral",
        condition: { field: "successfulReferrals", value: 5 },
        points: 150,
        createdAt: new Date(),
      },
    ];

    for (const achievement of defaultAchievements) {
      const existing = await achievementsCollection.findOne({ id: achievement.id });
      if (!existing) {
        await achievementsCollection.insertOne(achievement);
      }
    }

    logger.info("Achievements initialized successfully");
  } catch (error) {
    logger.error("Error initializing achievements:", error);
  }
};

/**
 * Check and award achievements for a user
 */
const checkAndAwardAchievements = async (userEmail) => {
  try {
    const {
      achievementsCollection,
      userAchievementsCollection,
      membershipsCollection,
      eventRegistrationsCollection,
      paymentsCollection,
      referralsCollection,
    } = getCollections();

    // Get user stats
    const clubJoinCount = await membershipsCollection.countDocuments({
      userEmail: userEmail,
      status: "active",
    });

    const eventRegistrationCount = await eventRegistrationsCollection.countDocuments({
      userEmail: userEmail,
    });

    const paymentCount = await paymentsCollection.countDocuments({
      userEmail: userEmail,
      status: "completed",
    });

    const referral = await referralsCollection.findOne({
      inviterEmail: userEmail,
    });
    const successfulReferrals = referral?.successfulReferrals || 0;

    // Calculate membership days (days since first membership)
    const firstMembership = await membershipsCollection
      .find({ userEmail: userEmail })
      .sort({ joinedAt: 1 })
      .limit(1)
      .toArray();

    let membershipDays = 0;
    if (firstMembership.length > 0) {
      const joinDate = new Date(firstMembership[0].joinedAt);
      const today = new Date();
      membershipDays = Math.floor((today - joinDate) / (1000 * 60 * 60 * 24));
    }

    const userStats = {
      clubJoinCount,
      eventRegistrationCount,
      paymentCount,
      successfulReferrals,
      membershipDays,
    };

    // Get all achievements
    const achievements = await achievementsCollection.find({}).toArray();

    // Get user's existing achievements
    const existingAchievements = await userAchievementsCollection
      .find({ userEmail: userEmail })
      .toArray();
    const existingAchievementIds = existingAchievements.map((a) => a.achievementId);

    // Check for new achievements
    const newAchievements = [];
    for (const achievement of achievements) {
      if (existingAchievementIds.includes(achievement.id)) {
        continue; // Already earned
      }

      const condition = achievement.condition;
      const userValue = userStats[condition.field] || 0;

      if (userValue >= condition.value) {
        // Award achievement
        const userAchievement = {
          userEmail: userEmail,
          achievementId: achievement.id,
          name: achievement.name,
          description: achievement.description,
          icon: achievement.icon,
          type: achievement.type,
          points: achievement.points,
          earnedAt: new Date(),
        };

        await userAchievementsCollection.insertOne(userAchievement);
        newAchievements.push(userAchievement);
        logger.info(`Awarded achievement "${achievement.name}" to ${userEmail}`);
      }
    }

    return newAchievements;
  } catch (error) {
    logger.error("Error checking and awarding achievements:", error);
    return [];
  }
};

/**
 * Get all available achievements
 */
const getAllAchievements = async (req, res) => {
  try {
    const { achievementsCollection } = getCollections();
    const achievements = await achievementsCollection.find({}).toArray();
    res.send(achievements);
  } catch (error) {
    logger.error("Error getting all achievements:", error);
    res.status(500).send({ message: "Failed to get achievements." });
  }
};

/**
 * Get user's achievements
 */
const getUserAchievements = async (req, res) => {
  try {
    const userEmail = req.tokenEmail;
    const { userAchievementsCollection } = getCollections();

    const userAchievements = await userAchievementsCollection
      .find({ userEmail: userEmail })
      .sort({ earnedAt: -1 })
      .toArray();

    // Calculate total points
    const totalPoints = userAchievements.reduce(
      (sum, achievement) => sum + achievement.points,
      0
    );

    res.send({
      achievements: userAchievements,
      totalPoints: totalPoints,
      totalEarned: userAchievements.length,
    });
  } catch (error) {
    logger.error("Error getting user achievements:", error);
    res.status(500).send({ message: "Failed to get user achievements." });
  }
};

/**
 * Get user stats for progress tracking
 */
const getUserStats = async (req, res) => {
  try {
    const userEmail = req.tokenEmail;
    const {
      membershipsCollection,
      eventRegistrationsCollection,
      paymentsCollection,
      referralsCollection,
    } = getCollections();

    const clubJoinCount = await membershipsCollection.countDocuments({
      userEmail: userEmail,
      status: "active",
    });

    const eventRegistrationCount = await eventRegistrationsCollection.countDocuments({
      userEmail: userEmail,
    });

    const paymentCount = await paymentsCollection.countDocuments({
      userEmail: userEmail,
      status: "completed",
    });

    const referral = await referralsCollection.findOne({
      inviterEmail: userEmail,
    });
    const successfulReferrals = referral?.successfulReferrals || 0;

    const firstMembership = await membershipsCollection
      .find({ userEmail: userEmail })
      .sort({ joinedAt: 1 })
      .limit(1)
      .toArray();

    let membershipDays = 0;
    if (firstMembership.length > 0) {
      const joinDate = new Date(firstMembership[0].joinedAt);
      const today = new Date();
      membershipDays = Math.floor((today - joinDate) / (1000 * 60 * 60 * 24));
    }

    res.send({
      clubJoinCount,
      eventRegistrationCount,
      paymentCount,
      successfulReferrals,
      membershipDays,
    });
  } catch (error) {
    logger.error("Error getting user stats:", error);
    res.status(500).send({ message: "Failed to get user stats." });
  }
};

module.exports = {
  initializeAchievements,
  checkAndAwardAchievements,
  getAllAchievements,
  getUserAchievements,
  getUserStats,
};
