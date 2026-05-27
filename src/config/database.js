const { MongoClient, ServerApiVersion } = require("mongodb");

const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
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
  };
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
};
