require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connectDatabase, getCollections, getFirebaseAdmin } = require("./src/config");
const { verifyToken, verifyAdmin, verifyManager, verifyMember } = require("./src/middleware/authMiddleware");
const userRoutes = require("./src/routes/userRoutes");
const clubRoutes = require("./src/routes/clubRoutes");
const eventRoutes = require("./src/routes/eventRoutes");
const { router: paymentRoutes, webhookRouter } = require("./src/routes/paymentRoutes");
const adminRoutes = require("./src/routes/adminRoutes");
const managerRoutes = require("./src/routes/managerRoutes");

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

// Debug logging for route registration
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Mount routes
console.log("Mounting routes:");
console.log("- /users -> userRoutes");
app.use("/users", userRoutes);

console.log("- /clubs -> clubRoutes");
app.use("/clubs", clubRoutes);

console.log("- /events -> eventRoutes");
app.use("/events", eventRoutes);

console.log("- /payments -> paymentRoutes");
app.use("/payments", paymentRoutes);

console.log("- /admin -> adminRoutes");
app.use("/admin", adminRoutes);

console.log("- /manager -> managerRoutes");
app.use("/manager", managerRoutes);

// Mount webhook with raw body parsing for Stripe signature verification
console.log("- /webhook -> webhookRouter");
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
      console.log("\nRegistered Routes:");
      console.log("\nUser Routes:");
      console.log("- POST /users/register");
      console.log("- POST /users/google-login");
      console.log("- PATCH /users/update");
      console.log("- GET /users/role");
      console.log("- GET /users/member/stats-and-upcoming-events");
      console.log("\nClub Routes:");
      console.log("- GET /clubs/");
      console.log("- GET /clubs/featuredClubs");
      console.log("- GET /clubs/popular-clubsManagers");
      console.log("- GET /clubs/member/clubs");
      console.log("- POST /clubs/join/:id");
      console.log("- GET /clubs/:id");
      console.log("\nEvent Routes:");
      console.log("- GET /events/");
      console.log("- GET /events/member/events");
      console.log("- GET /events/member/event-registration-status/:eventId");
      console.log("- POST /events/event-payment/create-checkout-session");
      console.log("- POST /events/events/register/:eventId");
      console.log("- GET /events/:id");
      console.log("\nPayment Routes:");
      console.log("- POST /payments/membership-payment/create-checkout-session");
      console.log("- GET /payments/member/payments");
      console.log("- GET /payments/success");
      console.log("- POST /payments/webhook");
      console.log("\nAdmin Routes:");
      console.log("- GET /admin/users");
      console.log("- PATCH /admin/users/role/:email");
      console.log("- DELETE /admin/users/:email");
      console.log("- GET /admin/clubs");
      console.log("- PATCH /admin/clubs/status/:clubId");
      console.log("- DELETE /admin/clubs/:clubId");
      console.log("\nManager Routes:");
      console.log("- GET /manager/clubs");
      console.log("- POST /manager/clubs");
      console.log("- PATCH /manager/clubs/:id");
      console.log("- DELETE /manager/clubs/:id");
      console.log("- GET /manager/events");
      console.log("- GET /manager/events/:eventId/registrations");
      console.log("- POST /manager/events");
      console.log("- PATCH /manager/events/:id");
      console.log("- DELETE /manager/events/:id");
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

run().catch(console.dir);
