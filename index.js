require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connectDatabase, getCollections, getFirebaseAdmin } = require("./src/config");
const { verifyToken, verifyAdmin, verifyManager, verifyMember } = require("./src/middleware/authMiddleware");
const userRoutes = require("./src/routes/userRoutes");
const clubRoutes = require("./src/routes/clubRoutes");
const eventRoutes = require("./src/routes/eventRoutes");
const { router: paymentRoutes, webhookRouter } = require("./src/routes/paymentRoutes");

const app = express();
const port = process.env.PORT || 5000;

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://clubsphere-client.vercel.app",
    ],
    credentials: true,
    optionSuccessStatus: 200,
  })
);
app.use(express.json());

const admin = getFirebaseAdmin();

// Mount routes
app.use("/users", userRoutes);
app.use("/clubs", clubRoutes);
app.use("/events", eventRoutes);

// Mount payment routes
app.use("/payments", paymentRoutes);

// Mount webhook with raw body parsing for Stripe signature verification
app.use("/webhook", express.raw({ type: "application/json" }), webhookRouter);

// Health check route
app.get("/", (req, res) => {
  res.send("ClubSphere Server is running!");
});

async function run() {
  try {
    await connectDatabase();
    console.log("Database connected successfully.");

    app.listen(port, () => {
      console.log(`ClubSphere Server listening on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

run().catch(console.dir);
