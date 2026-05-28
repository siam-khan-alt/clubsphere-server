const { MongoClient, ServerApiVersion } = require("mongodb");

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
  maxPoolSize: 50,
  minPoolSize: 10,
  retryWrites: true,
  retryReads: true,
});

let db = null;

const connectDatabase = async () => {
  if (db) return db;

  try {
    // await client.connect();
    db = client.db("ClubSphereDB");
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    // Create indexes for new collections to ensure query performance at scale
    const collections = getCollections();

    // clubProposalsCollection indexes
    await collections.clubProposalsCollection.createIndex({ clubId: 1 });
    await collections.clubProposalsCollection.createIndex({ status: 1, votingEndsAt: 1 });
    await collections.clubProposalsCollection.createIndex({ createdBy: 1 });
    await collections.clubProposalsCollection.createIndex({ createdAt: -1 });

    // clubCommentsCollection indexes
    await collections.clubCommentsCollection.createIndex({ clubId: 1, userEmail: 1 });
    await collections.clubCommentsCollection.createIndex({ clubId: 1, createdAt: -1 });
    await collections.clubCommentsCollection.createIndex({ "reactions.userEmail": 1 });

    // memberVotingPowerCollection indexes
    await collections.memberVotingPowerCollection.createIndex({ clubId: 1, userEmail: 1 });

    // clubWarsSeasonsCollection indexes
    await collections.clubWarsSeasonsCollection.createIndex({ status: 1 });
    await collections.clubWarsSeasonsCollection.createIndex({ startDate: 1 });
    await collections.clubWarsSeasonsCollection.createIndex({ endDate: 1 });

    // clubWarEventsCollection indexes
    await collections.clubWarEventsCollection.createIndex({ seasonId: 1 });
    await collections.clubWarEventsCollection.createIndex({ clubId: 1 });

    console.log("Database indexes created successfully.");

    return db;
  } catch (error) {
    console.error("MongoDB connection error:", error);
    throw error;
  }
};

const getDatabase = () => {
  if (!db) {
    throw new Error("Database not initialized. Call connectDatabase() first.");
  }
  return db;
};

const getCollections = () => {
  const database = getDatabase();
  return {
    usersCollection: database.collection("users"),
    clubsCollection: database.collection("clubs"),
    membershipsCollection: database.collection("memberships"),
    eventsCollection: database.collection("events"),
    paymentsCollection: database.collection("payments"),
    eventRegistrationsCollection: database.collection("eventRegistrations"),
    notificationsCollection: database.collection("notifications"),
    referralsCollection: database.collection("referrals"),
    achievementsCollection: database.collection("achievements"),
    userAchievementsCollection: database.collection("userAchievements"),
    chatRoomsCollection: database.collection("chatRooms"),
    messagesCollection: database.collection("messages"),
    clubCommentsCollection: database.collection("clubComments"),
    clubWarsSeasonsCollection: database.collection("clubWarsSeasons"),
    clubWarEventsCollection: database.collection("clubWarEvents"),
    clubProposalsCollection: database.collection("clubProposals"),
    memberVotingPowerCollection: database.collection("memberVotingPower"),
  };
};

/**
 * Start a MongoDB session for transactions
 * @returns {Promise<ClientSession>} MongoDB session
 */
const startSession = async () => {
  if (!db) {
    throw new Error("Database not initialized. Call connectDatabase() first.");
  }
  const session = client.startSession();
  return session;
};

const closeDatabase = async () => {
  await client.close();
  console.log("MongoDB connection closed.");
};

module.exports = {
  connectDatabase,
  getDatabase,
  getCollections,
  closeDatabase,
  client,
  startSession,
};
