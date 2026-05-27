const { ObjectId } = require("mongodb");
const { getCollections } = require("../config");
const logger = require("../config/logger");

/**
 * Middleware to check if club has active subscription
 * @param {string} requiredPlan - Minimum required plan (basic, pro, enterprise)
 */
const requireSubscription = (requiredPlan = "basic") => {
  return async (req, res, next) => {
    try {
      const { clubId } = req.params;
      const managerEmail = req.tokenEmail;
      const { clubsCollection } = getCollections();

      const club = await clubsCollection.findOne({
        _id: new ObjectId(clubId),
        managerEmail: managerEmail,
      });

      if (!club) {
        return res.status(403).send({ message: "You are not authorized to manage this club." });
      }

      const currentPlan = club.subscriptionPlan || "basic";
      const subscriptionStatus = club.subscriptionStatus || "inactive";
      const expiresAt = club.subscriptionExpiresAt;

      // Check if subscription is expired
      if (expiresAt && new Date(expiresAt) < new Date()) {
        return res.status(403).send({ 
          message: "Your subscription has expired. Please renew to continue.",
          code: "SUBSCRIPTION_EXPIRED"
        });
      }

      // Plan hierarchy: basic < pro < enterprise
      const planHierarchy = { basic: 1, pro: 2, enterprise: 3 };
      const currentLevel = planHierarchy[currentPlan] || 1;
      const requiredLevel = planHierarchy[requiredPlan] || 1;

      if (currentLevel < requiredLevel) {
        return res.status(403).send({ 
          message: `This feature requires ${requiredPlan} plan or higher.`,
          code: "UPGRADE_REQUIRED",
          currentPlan: currentPlan,
          requiredPlan: requiredPlan
        });
      }

      // Attach subscription info to request
      req.subscription = {
        plan: currentPlan,
        status: subscriptionStatus,
        expiresAt: expiresAt,
      };

      next();
    } catch (error) {
      logger.error("Error checking subscription:", error);
      res.status(500).send({ message: "Failed to verify subscription." });
    }
  };
};

/**
 * Middleware to check feature limits based on subscription plan
 */
const checkFeatureLimits = (feature) => {
  return async (req, res, next) => {
    try {
      const { clubId } = req.params;
      const managerEmail = req.tokenEmail;
      const { clubsCollection, membershipsCollection, eventsCollection } = getCollections();

      const club = await clubsCollection.findOne({
        _id: new ObjectId(clubId),
        managerEmail: managerEmail,
      });

      if (!club) {
        return res.status(403).send({ message: "You are not authorized to manage this club." });
      }

      const plan = club.subscriptionPlan || "basic";
      const expiresAt = club.subscriptionExpiresAt;

      // Check if subscription is expired
      if (expiresAt && new Date(expiresAt) < new Date()) {
        return res.status(403).send({ 
          message: "Your subscription has expired. Please renew to continue.",
          code: "SUBSCRIPTION_EXPIRED"
        });
      }

      // Feature limits based on plan
      const limits = {
        basic: { members: 50, events: 5 },
        pro: { members: 200, events: 20 },
        enterprise: { members: Infinity, events: Infinity },
      };

      const planLimits = limits[plan] || limits.basic;

      let currentUsage = 0;
      let limit = 0;
      let featureName = "";

      switch (feature) {
        case "members":
          currentUsage = await membershipsCollection.countDocuments({
            clubId: clubId,
            status: "active",
          });
          limit = planLimits.members;
          featureName = "members";
          break;
        case "events":
          currentUsage = await eventsCollection.countDocuments({
            clubId: clubId,
          });
          limit = planLimits.events;
          featureName = "events";
          break;
        default:
          return next();
      }

      if (currentUsage >= limit) {
        return res.status(403).send({ 
          message: `You've reached your ${featureName} limit (${limit}). Upgrade your plan to add more.`,
          code: "LIMIT_REACHED",
          currentUsage: currentUsage,
          limit: limit,
          feature: featureName
        });
      }

      next();
    } catch (error) {
      logger.error("Error checking feature limits:", error);
      res.status(500).send({ message: "Failed to check feature limits." });
    }
  };
};

module.exports = {
  requireSubscription,
  checkFeatureLimits,
};
