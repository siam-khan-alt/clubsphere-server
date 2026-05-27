const { ObjectId } = require("mongodb");
const { getCollections, startSession } = require("../config");
const logger = require("../config/logger");
const { notifyClubJoin, notifyMembershipStatusChange } = require("./notificationController");
const emailService = require("../utils/emailService");
const { deleteClubCascade } = require("../utils/cascadeDeleteService");

/**
 * Create a new club (manager only)
 */
const createClub = async (req, res) => {
  const {
    name,
    description,
    category,
    location,
    bannerImage,
    membershipFee,
    meetingSchedule,
  } = req.body;

  const managerEmail = req.tokenEmail;
  const { clubsCollection } = getCollections();

  if (
    !name ||
    !description ||
    !category ||
    !location ||
    membershipFee === undefined
  ) {
    return res.status(400).send({
      message:
        "Please provide all required club information (Name, Description, Category, Location, Fee).",
    });
  }

  if (typeof membershipFee !== "number" || membershipFee < 0) {
    return res
      .status(400)
      .send({ message: "Membership Fee must be a non-negative number." });
  }

  try {
    const newClub = {
      clubName: name,
      description: description,
      category: category,
      location: location,
      bannerImage: bannerImage || null,
      membershipFee: membershipFee,
      meetingSchedule: meetingSchedule || "TBD",
      managerEmail: managerEmail,
      status: "pending",
      members: [managerEmail],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await clubsCollection.insertOne(newClub);

    res.status(201).json({
      message:
        "Club creation request submitted successfully! Awaiting Admin approval.",
      clubId: result.insertedId,
      club: newClub,
    });
  } catch (error) {
    logger.error("Club creation error:", error);
    res.status(500).send({
      message: "Failed to submit club request due to server error.",
    });
  }
};

/**
 * Get all clubs for admin (admin only)
 */
const getAdminClubs = async (req, res) => {
  try {
    const { clubsCollection } = getCollections();
    const clubs = await clubsCollection.find({}).toArray();

    const refinedClubs = clubs.map((club) => ({
      ...club,
      membersCount: club.members ? club.members.length : 0,
      eventsCount: club.eventsCount || 0,
      membershipFee: club.membershipFee || 0,
    }));

    res.send(refinedClubs);
  } catch (error) {
    logger.error("Failed to fetch clubs for admin:", error);
    res.status(500).send({ message: "Could not retrieve club list." });
  }
};

/**
 * Update club status (admin only)
 */
const updateClubStatus = async (req, res) => {
  const clubId = req.params.clubId;
  const { status } = req.body;
  const { clubsCollection } = getCollections();

  if (!status || (status !== "approved" && status !== "rejected")) {
    return res.status(400).send({
      message: 'Invalid status provided. Must be "approved" or "rejected".',
    });
  }

  try {
    const result = await clubsCollection.updateOne(
      { _id: new ObjectId(clubId) },
      { $set: { status: status, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "Club not found." });
    }

    res.send({
      message: `Club status updated to ${status.toUpperCase()}`,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    logger.error("Admin club status update error:", error);
    res.status(500).send({
      message: "Failed to update club status due to server error.",
    });
  }
};

/**
 * Delete club (admin only)
 */
const deleteAdminClub = async (req, res) => {
  const clubId = req.params.clubId;

  if (!clubId) {
    return res
      .status(400)
      .send({ message: "Club ID is required for deletion." });
  }

  const session = await startSession();

  try {
    await session.withTransaction(async () => {
      const result = await deleteClubCascade(clubId, session);

      if (result.deletedCount === 0) {
        throw new Error("Club not found or already deleted.");
      }
    });

    res.send({
      message: "Club and all related records deleted successfully.",
    });
  } catch (error) {
    logger.error("Admin club deletion error:", error);
    res
      .status(500)
      .send({ message: "Failed to delete club due to server error." });
  } finally {
    await session.endSession();
  }
};

/**
 * Get popular clubs with manager details (public)
 */
const getPopularClubs = async (req, res) => {
  try {
    const { clubsCollection, usersCollection } = getCollections();
    const popularClubs = await clubsCollection
      .aggregate([
        {
          $addFields: {
            membersCount: { $size: { $ifNull: ["$members", []] } },
          },
        },
        { $sort: { membersCount: -1 } },
        { $limit: 6 },
        {
          $lookup: {
            from: "users",
            localField: "managerEmail",
            foreignField: "email",
            as: "managerDetails",
          },
        },
        { $unwind: "$managerDetails" },
        {
          $project: {
            clubName: 1,
            bannerImage: 1,
            category: 1,
            membersCount: 1,
            membershipFee: 1,
            location: 1,
            meetingSchedule: 1,
            description: 1,
            managerName: "$managerDetails.name",
            managerImage: "$managerDetails.photoURL",
          },
        },
      ])
      .toArray();

    res.send(popularClubs);
  } catch (error) {
    logger.error("Error fetching popular managers:", error);
    res.status(500).send({ message: "Error fetching popular managers" });
  }
};

/**
 * Get manager's clubs (manager only)
 */
const getManagerClubs = async (req, res) => {
  const managerEmail = req.tokenEmail;
  const { clubsCollection } = getCollections();

  try {
    const clubs = await clubsCollection
      .find({ managerEmail: managerEmail })
      .toArray();

    const refinedClubs = clubs.map((club) => ({
      ...club,
      membersCount: club.members ? club.members.length : 0,
      eventsCount: club.eventsCount || 0,
      membershipFee: club.membershipFee || 0,
    }));

    res.send(refinedClubs);
  } catch (error) {
    logger.error("Failed to fetch clubs for manager:", error);
    res
      .status(500)
      .send({ message: "Could not retrieve manager club list." });
  }
};

/**
 * Update club (manager only)
 */
const updateClub = async (req, res) => {
  const clubId = req.params.id;
  const updateData = req.body;
  const managerEmail = req.tokenEmail;
  const { clubsCollection } = getCollections();

  const updateDoc = {
    $set: {
      clubName: updateData.clubName,
      description: updateData.description,
      location: updateData.location,
      membershipFee: parseFloat(updateData.membershipFee),
      category: updateData.category,
      bannerImage: updateData.bannerImage,
      updatedAt: new Date(),
    },
  };
  try {
    const result = await clubsCollection.updateOne(
      {
        _id: new ObjectId(clubId),
        managerEmail: managerEmail,
      },
      updateDoc
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({
        message: "Club not found or you are not authorized to manage it.",
      });
    }

    res.send({ message: "Club details updated successfully." });
  } catch (error) {
    logger.error("Club update error:", error);
    res.status(500).send({ message: "Failed to update club." });
  }
};

/**
 * Delete club (manager only)
 */
const deleteClub = async (req, res) => {
  const clubId = req.params.id;
  const managerEmail = req.tokenEmail;
  const { clubsCollection } = getCollections();

  // Verify ownership first
  const club = await clubsCollection.findOne({
    _id: new ObjectId(clubId),
    managerEmail: managerEmail,
  });

  if (!club) {
    return res.status(404).send({
      message: "Club not found or you are not authorized to delete it.",
    });
  }

  const session = await startSession();

  try {
    await session.withTransaction(async () => {
      const result = await deleteClubCascade(clubId, session);

      if (result.deletedCount === 0) {
        throw new Error("Club not found or already deleted.");
      }
    });

    res.send({ message: "Club and all related records deleted successfully." });
  } catch (error) {
    logger.error("Club deletion error:", error);
    res.status(500).send({ message: "Failed to delete club." });
  } finally {
    await session.endSession();
  }
};

/**
 * Public club listing with search and filter
 */
const getPublicClubs = async (req, res) => {
  try {
    const { search, category, sort } = req.query;
    const { clubsCollection } = getCollections();
    let query = { status: "approved" };
    let sortOption = {};

    if (search) {
      query.clubName = { $regex: search, $options: "i" };
    }

    if (category && category !== "all") {
      query.category = category;
    }

    if (sort) {
      switch (sort) {
        case "fee_asc":
          sortOption.membershipFee = 1;
          break;
        case "fee_desc":
          sortOption.membershipFee = -1;
          break;
        case "newest":
          sortOption.createdAt = -1;
          break;
        case "oldest":
          sortOption.createdAt = 1;
          break;
        default:
          sortOption.createdAt = -1;
      }
    } else {
      sortOption.createdAt = -1;
    }

    const clubs = await clubsCollection
      .find(query)
      .sort(sortOption)
      .toArray();

    res.send(clubs);
  } catch (error) {
    logger.error("Public club listing error:", error);
    res
      .status(500)
      .send({ message: "Failed to fetch clubs due to server error." });
  }
};

/**
 * Get featured clubs (public)
 */
const getFeaturedClubs = async (req, res) => {
  try {
    const { clubsCollection } = getCollections();
    const featuredClubs = await clubsCollection
      .aggregate([
        { $match: { status: "approved" } },
        {
          $addFields: {
            memberCount: { $size: "$members" },
          },
        },
        { $sort: { memberCount: -1 } },
        { $limit: 6 },
        {
          $project: {
            _id: 1,
            clubName: 1,
            description: 1,
            members: 1,
            category: 1,
            location: 1,
            bannerImage: 1,
            membershipFee: 1,
          },
        },
      ])
      .toArray();

    res.status(200).send(featuredClubs);
  } catch (error) {
    logger.error("Public club listing error:", error);
    res
      .status(500)
      .send({ message: "Failed to fetch clubs due to server error." });
  }
};

/**
 * Get club details by ID (public)
 */
const getClubById = async (req, res) => {
  const clubId = req.params.id;
  const { clubsCollection } = getCollections();

  if (!ObjectId.isValid(clubId)) {
    return res.status(400).send({ message: "Invalid Club ID format." });
  }

  try {
    const club = await clubsCollection.findOne({
      _id: new ObjectId(clubId),
      status: "approved",
    });

    if (!club) {
      return res
        .status(404)
        .send({ message: "Club not found or not approved yet." });
    }

    res.send(club);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch club details due to server error.",
    });
  }
};

/**
 * Join a club (member only)
 */
const joinClub = async (req, res) => {
  const clubId = req.params.id;
  const userEmail = req.tokenEmail;
  const { paymentStatus } = req.body;
  const { clubsCollection, membershipsCollection } = getCollections();

  if (!ObjectId.isValid(clubId)) {
    return res.status(400).send({ message: "Invalid Club ID." });
  }

  try {
    const club = await clubsCollection.findOne({
      _id: new ObjectId(clubId),
      status: "approved",
    });
    if (!club) {
      return res
        .status(404)
        .send({ message: "Club not found or not approved." });
    }
    if (club.membershipFee > 0) {
      return res.status(400).send({
        message:
          "This club requires a paid membership. Please use the payment flow.",
      });
    }

    const existingMembership = await membershipsCollection.findOne({
      clubId: clubId,
      userEmail: userEmail,
      status: "active",
    });

    if (existingMembership) {
      return res.status(400).send({
        message: "You are already an active member of this club.",
      });
    }

    const newMembership = {
      userEmail: userEmail,
      clubId: clubId,
      status: "active",
      startDate: new Date(),
      endDate: null,
      paymentId: "FREE_JOIN",
      joinedAt: new Date(),
      subscriptionPlan: club.subscriptionPlan || "basic",
      subscriptionStatus: club.subscriptionStatus || "inactive",
      subscriptionExpiresAt: club.subscriptionExpiresAt || null,
    };
    await membershipsCollection.insertOne(newMembership);

    const updateResult = await clubsCollection.updateOne(
      { _id: new ObjectId(clubId), status: "approved" },
      { $addToSet: { members: userEmail } }
    );

    if (updateResult.modifiedCount === 0) {
      logger.warn(
        `Club ${clubId} members array was likely already updated for ${userEmail}.`
      );
    }

    // Send notification
    await notifyClubJoin(userEmail, club.clubName, clubId);

    res
      .status(201)
      .send({ message: "Successfully joined the club (Free Membership)." });
  } catch (error) {
    logger.error("Club joining failed (Free):", error);
    res.status(500).send({
      message: "Failed to process free join request due to server error.",
    });
  }
};

/**
 * Get member's clubs (member only)
 */
const getMemberClubs = async (req, res) => {
  const userEmail = req.tokenEmail;
  const { membershipsCollection, clubsCollection } = getCollections();

  try {
    const memberships = await membershipsCollection
      .find({ userEmail: userEmail, status: "active" })
      .toArray();

    const clubIds = memberships.map((membership) => new ObjectId(membership.clubId));
    const clubs = await clubsCollection
      .find({ _id: { $in: clubIds } })
      .toArray();

    const result = memberships.map((membership) => {
      const club = clubs.find((c) => c._id.toString() === membership.clubId);
      return {
        ...membership,
        clubDetails: club || { clubName: "Unknown Club" },
      };
    });

    res.send(result);
  } catch (error) {
    logger.error("Error fetching member clubs:", error);
    res.status(500).send({ message: "Failed to fetch member clubs." });
  }
};

/**
 * Get club members (manager only)
 */
const getClubMembers = async (req, res) => {
  const clubId = req.params.clubId;
  const managerEmail = req.tokenEmail;
  const { clubsCollection, membershipsCollection, usersCollection } = getCollections();

  try {
    const club = await clubsCollection.findOne({
      _id: new ObjectId(clubId),
      managerEmail: managerEmail,
    });

    if (!club) {
      return res.status(404).send({ message: "Club not found or you are not the manager." });
    }

    const memberships = await membershipsCollection
      .find({ clubId: clubId, status: "active" })
      .toArray();

    const userEmails = memberships.map((m) => m.userEmail);
    const users = await usersCollection
      .find({ email: { $in: userEmails } })
      .toArray();

    const userMap = users.reduce((acc, user) => {
      acc[user.email] = user;
      return acc;
    }, {});

    const result = memberships.map((membership) => ({
      ...membership,
      userDetails: userMap[membership.userEmail] || { name: "Unknown User" },
    }));

    res.send({ clubName: club.clubName, members: result });
  } catch (error) {
    logger.error("Error fetching club members:", error);
    res.status(500).send({ message: "Failed to fetch club members." });
  }
};

/**
 * Update membership status (manager only)
 */
const updateMembershipStatus = async (req, res) => {
  const membershipId = req.params.memberId;
  const managerEmail = req.tokenEmail;
  const { status } = req.body;
  const { membershipsCollection, clubsCollection } = getCollections();

  if (!status || (status !== "active" && status !== "expired")) {
    return res.status(400).send({ message: 'Invalid status. Must be "active" or "expired".' });
  }

  try {
    const membership = await membershipsCollection.findOne({
      _id: new ObjectId(membershipId),
    });

    if (!membership) {
      return res.status(404).send({ message: "Membership not found." });
    }

    const club = await clubsCollection.findOne({
      _id: new ObjectId(membership.clubId),
      managerEmail: managerEmail,
    });

    if (!club) {
      return res.status(403).send({ message: "You are not authorized to manage this club." });
    }

    const result = await membershipsCollection.updateOne(
      { _id: new ObjectId(membershipId) },
      { $set: { status: status, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).send({ message: "Membership not found." });
    }

    // Send notification
    await notifyMembershipStatusChange(
      membership.userEmail,
      club.clubName,
      status
    );

    // Send email
    try {
      await emailService.sendMembershipStatusEmail(
        membership.userEmail,
        membership.userEmail.split("@")[0], // Simple name extraction
        club.clubName,
        status,
        membership.endDate ? membership.endDate.toISOString().split("T")[0] : null
      );
    } catch (emailError) {
      logger.error("Failed to send membership status email:", emailError);
    }

    res.send({ message: `Membership status updated to ${status}.` });
  } catch (error) {
    logger.error("Error updating membership status:", error);
    res.status(500).send({ message: "Failed to update membership status." });
  }
};

/**
 * Get manager dashboard stats (manager only)
 */
const getManagerStats = async (req, res) => {
  const managerEmail = req.tokenEmail;
  const { clubsCollection, eventsCollection, membershipsCollection, eventRegistrationsCollection } = getCollections();

  try {
    const clubs = await clubsCollection
      .find({ managerEmail: managerEmail })
      .toArray();

    const clubIds = clubs.map((club) => club._id.toString());

    const events = await eventsCollection
      .find({ clubId: { $in: clubIds } })
      .toArray();

    const memberships = await membershipsCollection
      .find({ clubId: { $in: clubIds }, status: "active" })
      .toArray();

    const eventIds = events.map((event) => event._id.toString());
    const registrations = await eventRegistrationsCollection
      .find({ eventId: { $in: eventIds } })
      .toArray();

    const totalMembers = memberships.length;
    const totalEvents = events.length;
    const totalRegistrations = registrations.length;

    const pendingClubs = clubs.filter((club) => club.status === "pending").length;
    const approvedClubs = clubs.filter((club) => club.status === "approved").length;

    res.send({
      totalClubs: clubs.length,
      totalEvents,
      totalMembers,
      totalRegistrations,
      pendingClubs,
      approvedClubs,
    });
  } catch (error) {
    logger.error("Error fetching manager stats:", error);
    res.status(500).send({ message: "Failed to fetch manager stats." });
  }
};

module.exports = {
  createClub,
  getAdminClubs,
  updateClubStatus,
  deleteAdminClub,
  getPopularClubs,
  getManagerClubs,
  updateClub,
  deleteClub,
  getPublicClubs,
  getFeaturedClubs,
  getClubById,
  joinClub,
  getMemberClubs,
  getClubMembers,
  updateMembershipStatus,
  getManagerStats,
};
