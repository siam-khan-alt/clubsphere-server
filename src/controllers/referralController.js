const { ObjectId } = require("mongodb");
const { getCollections, startSession } = require("../config");
const logger = require("../config/logger");

/**
 * Generate a unique referral code
 */
const generateReferralCode = () => {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

/**
 * Get or create referral code for user
 */
const getReferralCode = async (req, res) => {
  try {
    const userEmail = req.tokenEmail;
    const { referralsCollection } = getCollections();

    let referral = await referralsCollection.findOne({
      inviterEmail: userEmail,
    });

    if (!referral) {
      const code = generateReferralCode();
      // Use atomic findOneAndUpdate with upsert to prevent race condition
      const result = await referralsCollection.findOneAndUpdate(
        { inviterEmail: userEmail },
        {
          $setOnInsert: {
            inviterEmail: userEmail,
            referralCode: code,
            invitedUsers: [],
            totalReferrals: 0,
            successfulReferrals: 0,
            creditsEarned: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          }
        },
        { upsert: true, returnDocument: 'after' }
      );
      referral = result;
    }

    res.send({
      referralCode: referral.referralCode,
      totalReferrals: referral.totalReferrals,
      successfulReferrals: referral.successfulReferrals,
      creditsEarned: referral.creditsEarned,
      referralLink: `${process.env.CLIENT_URL || "http://localhost:5173"}/register?ref=${referral.referralCode}`,
    });
  } catch (error) {
    logger.error("Error getting referral code:", error);
    res.status(500).send({ message: "Failed to get referral code." });
  }
};

/**
 * Track referral sign-up
 */
const trackReferralSignup = async (req, res) => {
  try {
    const { referralCode } = req.body;
    const userEmail = req.tokenEmail;
    const { referralsCollection, usersCollection } = getCollections();

    if (!referralCode) {
      return res.send({ message: "No referral code provided" });
    }

    // Find referral by code
    const referral = await referralsCollection.findOne({
      referralCode: referralCode,
    });

    if (!referral) {
      return res.status(400).send({ message: "Invalid referral code" });
    }

    // Check for self-referral
    if (referral.inviterEmail === userEmail) {
      return res.status(400).send({ message: "Cannot refer yourself" });
    }

    // Check if user already referred
    const alreadyReferred = referral.invitedUsers.some(
      (user) => user.email === userEmail
    );

    if (alreadyReferred) {
      return res.status(400).send({ message: "You have already used this referral code" });
    }

    // Get IP address and device fingerprint for fraud prevention
    const ipAddress = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Check for IP rate limiting (max 5 referrals per IP per day)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentReferralsFromIP = await referralsCollection.countDocuments({
      referralCode: referralCode,
      'invitedUsers.joinedAt': { $gte: oneDayAgo },
      'invitedUsers.ipAddress': ipAddress
    });

    if (recentReferralsFromIP >= 5) {
      logger.warn(`Rate limit exceeded for IP ${ipAddress} on referral code ${referralCode}`);
      return res.status(429).send({ message: "Too many referrals from this IP address. Please try again later." });
    }

    // Add user to invited users with IP and device tracking
    await referralsCollection.updateOne(
      { _id: referral._id },
      {
        $push: {
          invitedUsers: {
            email: userEmail,
            joinedAt: new Date(),
            hasMadeFirstPayment: false,
            ipAddress: ipAddress,
            userAgent: userAgent,
          },
        },
        $inc: {
          totalReferrals: 1,
        },
        $set: {
          updatedAt: new Date(),
        },
      }
    );

    res.send({
      message: "Referral tracked successfully",
      referralCode: referralCode,
    });
  } catch (error) {
    logger.error("Error tracking referral signup:", error);
    res.status(500).send({ message: "Failed to track referral signup." });
  }
};

/**
 * Allocate referral credits after first payment
 */
const allocateReferralCredits = async (req, res) => {
  try {
    const { userEmail, paymentAmount } = req.body;
    const { referralsCollection } = getCollections();

    const dbSession = await startSession();
    try {
      await dbSession.withTransaction(async () => {
        // Find referral where this user was invited
        const referral = await referralsCollection.findOne(
          { "invitedUsers.email": userEmail },
          { session: dbSession }
        );

        if (!referral) {
          throw new Error("No referral found for this user");
        }

        // Check if credits already allocated
        const invitedUser = referral.invitedUsers.find(
          (user) => user.email === userEmail
        );

        if (invitedUser.hasMadeFirstPayment) {
          throw new Error("Credits already allocated");
        }

        // Calculate credits (10% of payment amount, max $10)
        const creditAmount = Math.min(paymentAmount * 0.1, 10);

        // Update referral atomically
        await referralsCollection.updateOne(
          {
            _id: referral._id,
            "invitedUsers.email": userEmail,
          },
          {
            $set: {
              "invitedUsers.$.hasMadeFirstPayment": true,
              "invitedUsers.$.firstPaymentAmount": paymentAmount,
              "invitedUsers.$.creditsEarned": creditAmount,
              "invitedUsers.$.paymentDate": new Date(),
              updatedAt: new Date(),
            },
            $inc: {
              successfulReferrals: 1,
              creditsEarned: creditAmount,
            },
          },
          { session: dbSession }
        );
      });
    } finally {
      await dbSession.endSession();
    }

    // Fetch updated referral for response
    const referral = await referralsCollection.findOne({
      "invitedUsers.email": userEmail,
    });
    const creditAmount = Math.min(paymentAmount * 0.1, 10);

    res.send({
      message: "Referral credits allocated successfully",
      creditAmount: creditAmount,
      totalCredits: referral.creditsEarned,
    });
  } catch (error) {
    logger.error("Error allocating referral credits:", error);
    if (error.message === "No referral found for this user") {
      return res.send({ message: "No referral found for this user" });
    }
    if (error.message === "Credits already allocated") {
      return res.send({ message: "Credits already allocated" });
    }
    res.status(500).send({ message: "Failed to allocate referral credits." });
  }
};

/**
 * Get referral stats for user
 */
const getReferralStats = async (req, res) => {
  try {
    const userEmail = req.tokenEmail;
    const { referralsCollection } = getCollections();

    const referral = await referralsCollection.findOne({
      inviterEmail: userEmail,
    });

    if (!referral) {
      return res.send({
        referralCode: null,
        totalReferrals: 0,
        successfulReferrals: 0,
        creditsEarned: 0,
        invitedUsers: [],
      });
    }

    res.send({
      referralCode: referral.referralCode,
      totalReferrals: referral.totalReferrals,
      successfulReferrals: referral.successfulReferrals,
      creditsEarned: referral.creditsEarned,
      invitedUsers: referral.invitedUsers,
      referralLink: `${process.env.CLIENT_URL || "http://localhost:5173"}/register?ref=${referral.referralCode}`,
    });
  } catch (error) {
    logger.error("Error getting referral stats:", error);
    res.status(500).send({ message: "Failed to get referral stats." });
  }
};

module.exports = {
  getReferralCode,
  trackReferralSignup,
  allocateReferralCredits,
  getReferralStats,
};
