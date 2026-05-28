const { ObjectId } = require("mongodb");
const { getCollections, startSession } = require("../config");
const logger = require("../config/logger");
const { notifyClubJoin, notifyMembershipStatusChange } = require("./notificationController");
const emailService = require("../utils/emailService");
const { deleteClubCascade } = require("../utils/cascadeDeleteService");
const { createGroupRoom, addParticipantToRoom, removeParticipantFromRoom } = require("./chatController");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { awardPoints } = require("../services/scoreTrackerService");

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

    // Create group chat room for the club
    await createGroupRoom(result.insertedId.toString(), name, managerEmail);

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
  const { clubsCollection, membershipsCollection, chatRoomsCollection } = getCollections();

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

    const dbSession = await startSession();
    try {
      await dbSession.withTransaction(async () => {
        await membershipsCollection.insertOne(newMembership, { session: dbSession });

        const updateResult = await clubsCollection.updateOne(
          { _id: new ObjectId(clubId), status: "approved" },
          { $addToSet: { members: userEmail } },
          { session: dbSession }
        );

        if (updateResult.modifiedCount === 0) {
          logger.warn(
            `Club ${clubId} members array was likely already updated for ${userEmail}.`
          );
        }
      });
    } finally {
      await dbSession.endSession();
    }

    // Award points for new member
    await awardPoints(clubId, "new_member");

    // Add user to club's group chat room
    const chatRoom = await chatRoomsCollection.findOne({
      clubId: clubId,
      type: "group",
    });
    if (chatRoom) {
      await addParticipantToRoom(chatRoom._id.toString(), userEmail);
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

/**
 * Leave a club (member only)
 */
const leaveClub = async (req, res) => {
  const clubId = req.params.id;
  const userEmail = req.tokenEmail;
  const {
    membershipsCollection,
    clubsCollection,
    chatRoomsCollection,
  } = getCollections();

  try {
    // Find the user's active membership for this club
    const membership = await membershipsCollection.findOne({
      clubId: clubId,
      userEmail: userEmail,
      status: "active",
    });

    if (!membership) {
      return res.status(400).send({
        message: "You are not an active member of this club.",
      });
    }

    // Get club details to check for Stripe subscription
    const club = await clubsCollection.findOne({
      _id: new ObjectId(clubId),
    });

    if (!club) {
      return res.status(404).send({
        message: "Club not found.",
      });
    }

    // Cancel Stripe subscription if the user has a paid subscription
    if (membership.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(membership.stripeSubscriptionId);
        logger.info(
          `Cancelled Stripe subscription ${membership.stripeSubscriptionId} for user ${userEmail}`
        );
      } catch (stripeError) {
        logger.error(
          `Failed to cancel Stripe subscription for user ${userEmail}:`,
          stripeError
        );
        // Continue with leaving the club even if Stripe cancellation fails
      }
    }

    // Wrap all updates in a transaction for atomicity
    const dbSession = await startSession();
    try {
      await dbSession.withTransaction(async () => {
        // Update membership status to cancelled
        await membershipsCollection.updateOne(
          { _id: membership._id },
          {
            $set: {
              status: "cancelled",
              endDate: new Date(),
              updatedAt: new Date(),
            },
          },
          { session: dbSession }
        );

        // Remove user from club's members array
        await clubsCollection.updateOne(
          { _id: new ObjectId(clubId) },
          { $pull: { members: userEmail } },
          { session: dbSession }
        );

        // Remove user from club's group chat participants
        await chatRoomsCollection.updateOne(
          { clubId: clubId, type: "group" },
          { $pull: { participants: userEmail } },
          { session: dbSession }
        );
      });
    } finally {
      await dbSession.endSession();
    }

    // Send notification about membership status change
    await notifyMembershipStatusChange(
      userEmail,
      club.clubName,
      "cancelled",
      membership.endDate
    );

    res.status(200).send({
      message: "Successfully left the club.",
    });
  } catch (error) {
    logger.error("Club leave failed:", error);
    res.status(500).send({
      message: "Failed to leave the club due to server error.",
    });
  }
};

/**
 * Get all comments for a club (public access)
 */
const getClubComments = async (req, res) => {
  const clubId = req.params.id;
  const { clubCommentsCollection } = getCollections();

  try {
    const comments = await clubCommentsCollection
      .find({ clubId: clubId })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).send(comments);
  } catch (error) {
    logger.error("Error fetching club comments:", error);
    res.status(500).send({ message: "Failed to fetch comments." });
  }
};

/**
 * Add a comment to a club (only approved members or manager)
 */
const addClubComment = async (req, res) => {
  const clubId = req.params.id;
  const userEmail = req.tokenEmail;
  const { text } = req.body;
  const { clubCommentsCollection, clubsCollection, membershipsCollection } = getCollections();

  try {
    // Check if user is the club manager or an approved member
    const club = await clubsCollection.findOne({ _id: new ObjectId(clubId) });

    if (!club) {
      return res.status(404).send({ message: "Club not found." });
    }

    // Check if user is manager
    const isManager = club.managerEmail === userEmail;

    // Check if user is an approved member
    const membership = await membershipsCollection.findOne({
      clubId: clubId,
      userEmail: userEmail,
      status: "active",
    });

    if (!isManager && !membership) {
      return res.status(403).send({
        message: "Only approved club members or the manager can comment.",
      });
    }

    // Get user details for avatar and name
    const { usersCollection } = getCollections();
    const user = await usersCollection.findOne({ email: userEmail });

    const newComment = {
      clubId: clubId,
      userEmail: userEmail,
      userName: user?.name || userEmail.split("@")[0],
      userAvatar: user?.photoURL || null,
      text: text,
      reactions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await clubCommentsCollection.insertOne(newComment);

    // Award points for posting a comment
    await awardPoints(clubId, "post_comment");

    res.status(201).send({
      message: "Comment added successfully.",
      comment: newComment,
    });
  } catch (error) {
    logger.error("Error adding club comment:", error);
    res.status(500).send({ message: "Failed to add comment." });
  }
};

/**
 * Toggle a reaction on a comment (any authenticated user)
 */
const toggleCommentReaction = async (req, res) => {
  const clubId = req.params.id;
  const commentId = req.params.commentId;
  const { type } = req.body;
  const userEmail = req.tokenEmail;
  const { clubCommentsCollection } = getCollections();

  try {
    const dbSession = await startSession();
    try {
      await dbSession.withTransaction(async () => {
        // Find the comment
        const comment = await clubCommentsCollection.findOne(
          { _id: new ObjectId(commentId), clubId: clubId },
          { session: dbSession }
        );

        if (!comment) {
          throw new Error("Comment not found.");
        }

        // Check if user already has a reaction
        const existingReaction = comment.reactions.find(
          (r) => r.userEmail === userEmail
        );

        if (existingReaction) {
          if (existingReaction.type === type) {
            // Same reaction type - atomically remove it (toggle off)
            await clubCommentsCollection.updateOne(
              { _id: new ObjectId(commentId) },
              {
                $pull: { reactions: { userEmail: userEmail } },
                $set: { updatedAt: new Date() },
              },
              { session: dbSession }
            );
          } else {
            // Different reaction type - atomically update it
            await clubCommentsCollection.updateOne(
              { _id: new ObjectId(commentId), "reactions.userEmail": userEmail },
              {
                $set: {
                  "reactions.$.type": type,
                  "reactions.$.updatedAt": new Date(),
                  updatedAt: new Date(),
                },
              },
              { session: dbSession }
            );
          }
        } else {
          // No existing reaction - atomically add new one
          await clubCommentsCollection.updateOne(
            { _id: new ObjectId(commentId) },
            {
              $push: {
                reactions: {
                  userEmail: userEmail,
                  type: type,
                  createdAt: new Date(),
                },
              },
              $set: { updatedAt: new Date() },
            },
            { session: dbSession }
          );
        }
      });
    } finally {
      await dbSession.endSession();
    }

    // Award points for giving a reaction
    await awardPoints(clubId, "give_reaction");

    // Fetch updated comment
    const updatedComment = await clubCommentsCollection.findOne({
      _id: new ObjectId(commentId),
    });

    res.status(200).send({
      message: "Reaction updated successfully.",
      comment: updatedComment,
    });
  } catch (error) {
    logger.error("Error toggling comment reaction:", error);
    if (error.message === "Comment not found.") {
      return res.status(404).send({ message: error.message });
    }
    res.status(500).send({ message: "Failed to update reaction." });
  }
};

/**
 * Edit a comment (only comment owner)
 */
const editClubComment = async (req, res) => {
  const clubId = req.params.id;
  const commentId = req.params.commentId;
  const userEmail = req.tokenEmail;
  const { text } = req.body;
  const { clubCommentsCollection, clubsCollection } = getCollections();

  try {
    // Find the comment
    const comment = await clubCommentsCollection.findOne({
      _id: new ObjectId(commentId),
      clubId: clubId,
    });

    if (!comment) {
      return res.status(404).send({ message: "Comment not found." });
    }

    // Check if user is the comment owner
    if (comment.userEmail !== userEmail) {
      return res.status(403).send({
        message: "Only the comment owner can edit it.",
      });
    }

    // Update the comment
    await clubCommentsCollection.updateOne(
      {
        _id: new ObjectId(commentId),
        clubId: clubId,
      },
      {
        $set: {
          text: text,
          updatedAt: new Date(),
        },
      }
    );

    // Fetch updated comment
    const updatedComment = await clubCommentsCollection.findOne({
      _id: new ObjectId(commentId),
    });

    res.status(200).send({
      message: "Comment updated successfully.",
      comment: updatedComment,
    });
  } catch (error) {
    logger.error("Error editing club comment:", error);
    res.status(500).send({ message: "Failed to edit comment." });
  }
};

/**
 * Delete a comment (comment owner or club manager)
 */
const deleteClubComment = async (req, res) => {
  const clubId = req.params.id;
  const commentId = req.params.commentId;
  const userEmail = req.tokenEmail;
  const { clubCommentsCollection, clubsCollection } = getCollections();

  try {
    // Find the comment
    const comment = await clubCommentsCollection.findOne({
      _id: new ObjectId(commentId),
      clubId: clubId,
    });

    if (!comment) {
      return res.status(404).send({ message: "Comment not found." });
    }

    // Find the club to check if user is manager
    const club = await clubsCollection.findOne({ _id: new ObjectId(clubId) });

    if (!club) {
      return res.status(404).send({ message: "Club not found." });
    }

    // Check if user is comment owner or club manager
    const isOwner = comment.userEmail === userEmail;
    const isManager = club.managerEmail === userEmail;

    if (!isOwner && !isManager) {
      return res.status(403).send({
        message: "Only the comment owner or club manager can delete it.",
      });
    }

    // Delete the comment
    await clubCommentsCollection.deleteOne({
      _id: new ObjectId(commentId),
      clubId: clubId,
    });

    res.status(200).send({ message: "Comment deleted successfully." });
  } catch (error) {
    logger.error("Error deleting club comment:", error);
    res.status(500).send({ message: "Failed to delete comment." });
  }
};

/**
 * Get current active season for Club Wars
 */
const getCurrentSeason = async (req, res) => {
  try {
    const { clubWarsSeasonsCollection } = getCollections();

    const currentSeason = await clubWarsSeasonsCollection.findOne({
      status: "active",
    });

    if (!currentSeason) {
      return res.status(404).send({ message: "No active season found." });
    }

    // Sort clubs by points descending
    const sortedClubs = currentSeason.clubs.sort((a, b) => b.points - a.points);

    res.status(200).send({
      season: {
        seasonName: currentSeason.seasonName,
        startDate: currentSeason.startDate,
        endDate: currentSeason.endDate,
        status: currentSeason.status,
      },
      leaderboard: sortedClubs,
    });
  } catch (error) {
    logger.error("Error fetching current season:", error);
    res.status(500).send({ message: "Failed to fetch current season." });
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
  leaveClub,
  getMemberClubs,
  getClubMembers,
  updateMembershipStatus,
  getManagerStats,
  getClubComments,
  addClubComment,
  toggleCommentReaction,
  editClubComment,
  deleteClubComment,
  getCurrentSeason,
};
