const { getCollections } = require("../config/database");
const logger = require("../config/logger");
const { getSocketIo } = require("../utils/socket");
const { ObjectId } = require("mongodb");

/**
 * Point values for different actions
 */
const POINT_VALUES = {
  new_member: 50,
  create_event: 40,
  event_registration: 20,
  post_comment: 10,
  give_reaction: 2,
};

/**
 * Award points to a club for a specific action
 * @param {string} clubId - The club ID
 * @param {string} actionType - The type of action (new_member, create_event, event_registration, post_comment, give_reaction)
 */
const awardPoints = async (clubId, actionType) => {
  try {
    const { clubWarsSeasonsCollection, clubsCollection } = getCollections();
    const io = getSocketIo();

    // Validate action type
    if (!POINT_VALUES[actionType]) {
      logger.warn(`Invalid action type: ${actionType}`);
      return;
    }

    // Get current active season
    const currentSeason = await clubWarsSeasonsCollection.findOne({
      status: "active",
    });

    if (!currentSeason) {
      logger.warn("No active season found for awarding points");
      return;
    }

    const points = POINT_VALUES[actionType];

    // Atomic update: Try to increment existing club entry
    const updateResult = await clubWarsSeasonsCollection.updateOne(
      { _id: currentSeason._id, "clubs.clubId": clubId },
      {
        $inc: {
          "clubs.$.points": points,
          "clubs.$.metrics.totalComments": actionType === "post_comment" ? 1 : 0,
          "clubs.$.metrics.totalReactions": actionType === "give_reaction" ? 1 : 0,
          "clubs.$.metrics.memberGrowth": actionType === "new_member" ? 1 : 0,
          "clubs.$.metrics.eventAttendance": actionType === "event_registration" ? 1 : 0,
          "clubs.$.metrics.totalEvents": actionType === "create_event" ? 1 : 0,
        },
      }
    );

    // If no document was modified, club entry doesn't exist - create it atomically
    if (updateResult.matchedCount === 0) {
      const club = await clubsCollection.findOne({ _id: new ObjectId(clubId) });

      if (!club) {
        logger.warn(`Club not found: ${clubId}`);
        return;
      }

      const newClubEntry = {
        clubId: clubId,
        clubName: club.clubName,
        clubLogo: club.logo || null,
        points: points,
        rank: 0,
        metrics: {
          totalComments: actionType === "post_comment" ? 1 : 0,
          totalReactions: actionType === "give_reaction" ? 1 : 0,
          memberGrowth: actionType === "new_member" ? 1 : 0,
          eventAttendance: actionType === "event_registration" ? 1 : 0,
          totalEvents: actionType === "create_event" ? 1 : 0,
          qualityScore: 0,
        },
        achievements: [],
      };

      // Use $addToSet to prevent duplicates if concurrent calls occur
      await clubWarsSeasonsCollection.updateOne(
        { _id: currentSeason._id, "clubs.clubId": { $ne: clubId } },
        { $push: { clubs: newClubEntry } }
      );
    }

    // Recalculate ranks
    await recalculateRanks(currentSeason._id);

    // Broadcast leaderboard update via Socket.io
    if (io) {
      const updatedSeason = await clubWarsSeasonsCollection.findOne({
        _id: currentSeason._id,
      });
      io.emit("leaderboardUpdate", updatedSeason);
      logger.info(`Broadcasted leaderboard update for club ${clubId}`);
    }

    logger.info(`Awarded ${points} points to club ${clubId} for ${actionType}`);
  } catch (error) {
    logger.error(`Error awarding points to club ${clubId}:`, error);
  }
};

/**
 * Recalculate ranks for all clubs in a season
 * @param {ObjectId} seasonId - The season ID
 */
const recalculateRanks = async (seasonId) => {
  try {
    const { clubWarsSeasonsCollection } = getCollections();

    const season = await clubWarsSeasonsCollection.findOne({ _id: seasonId });

    if (!season) {
      logger.warn(`Season not found for rank recalculation: ${seasonId}`);
      return;
    }

    // Sort clubs by points descending
    const sortedClubs = season.clubs.sort((a, b) => b.points - a.points);

    // Update ranks
    const updatedClubs = sortedClubs.map((club, index) => ({
      ...club,
      rank: index + 1,
    }));

    await clubWarsSeasonsCollection.updateOne(
      { _id: seasonId },
      { $set: { clubs: updatedClubs } }
    );

    logger.info(`Recalculated ranks for season ${seasonId}`);
  } catch (error) {
    logger.error("Error recalculating ranks:", error);
  }
};

/**
 * Initialize a new season
 * @param {string} seasonName - The season name
 * @param {Date} startDate - The season start date
 * @param {Date} endDate - The season end date
 */
const initializeSeason = async (seasonName, startDate, endDate) => {
  try {
    const { clubWarsSeasonsCollection } = getCollections();

    const newSeason = {
      seasonName: seasonName,
      startDate: startDate,
      endDate: endDate,
      status: "upcoming",
      clubs: [],
      rewards: {
        winner: {
          clubId: null,
          prize: null,
        },
        topThree: [],
      },
      createdAt: new Date(),
    };

    await clubWarsSeasonsCollection.insertOne(newSeason);

    logger.info(`Initialized new season: ${seasonName}`);
    return newSeason;
  } catch (error) {
    logger.error("Error initializing season:", error);
    throw error;
  }
};

/**
 * Activate a season
 * @param {ObjectId} seasonId - The season ID
 */
const activateSeason = async (seasonId) => {
  try {
    const { clubWarsSeasonsCollection } = getCollections();

    await clubWarsSeasonsCollection.updateOne(
      { _id: seasonId },
      {
        $set: {
          status: "active",
        },
      }
    );

    logger.info(`Activated season: ${seasonId}`);
  } catch (error) {
    logger.error("Error activating season:", error);
    throw error;
  }
};

module.exports = {
  awardPoints,
  recalculateRanks,
  initializeSeason,
  activateSeason,
  POINT_VALUES,
};
