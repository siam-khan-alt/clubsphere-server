require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connectDatabase, getCollections, getFirebaseAdmin } = require("./src/config");
const { verifyToken, verifyAdmin, verifyManager, verifyMember } = require("./src/middleware/authMiddleware");
const { generalLimiter, authLimiter, publicLimiter, webhookLimiter } = require("./src/middleware/rateLimiter");
const { errorHandler, notFoundHandler } = require("./src/middleware/errorHandler");
const logger = require("./src/config/logger");
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

// Request logging middleware
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get("user-agent"),
  });
  next();
});

// Mount routes with rate limiting
logger.info("Mounting routes:");
logger.info("- /users -> userRoutes (auth limiter)");
app.use("/users", authLimiter, userRoutes);

logger.info("- /clubs -> clubRoutes (public limiter)");
app.use("/clubs", publicLimiter, clubRoutes);

logger.info("- /events -> eventRoutes (public limiter)");
app.use("/events", publicLimiter, eventRoutes);

logger.info("- /payments -> paymentRoutes (general limiter)");
app.use("/payments", generalLimiter, paymentRoutes);

logger.info("- /admin -> adminRoutes (general limiter)");
app.use("/admin", generalLimiter, adminRoutes);

logger.info("- /manager -> managerRoutes (general limiter)");
app.use("/manager", generalLimiter, managerRoutes);

// Mount webhook with raw body parsing for Stripe signature verification
logger.info("- /webhook -> webhookRouter (webhook limiter)");
app.use("/webhook", express.raw({ type: "application/json" }), webhookLimiter, webhookRouter);

// Health check route (no rate limiting)
app.get("/", (req, res) => {
  res.send("ClubSphere Server is running!");
});

// 404 handler (must be after all routes)
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

async function run() {
  try {
    await connectDatabase();
    logger.info("Database connected successfully.");

    app.listen(port, () => {
      logger.info(`ClubSphere Server listening on port ${port}`);
      logger.info("\nRegistered Routes:");
      logger.info("\nUser Routes:");
      logger.info("- POST /users/register");
      logger.info("- POST /users/google-login");
      logger.info("- PATCH /users/update");
      logger.info("- GET /users/role");
      logger.info("- GET /users/member/stats-and-upcoming-events");
      logger.info("\nClub Routes:");
      logger.info("- GET /clubs/");
      logger.info("- GET /clubs/featuredClubs");
      logger.info("- GET /clubs/popular-clubsManagers");
      logger.info("- GET /clubs/member/clubs");
      logger.info("- POST /clubs/join/:id");
      logger.info("- GET /clubs/:id");
      logger.info("\nEvent Routes:");
      logger.info("- GET /events/");
      logger.info("- GET /events/member/events");
      logger.info("- GET /events/member/event-registration-status/:eventId");
      logger.info("- POST /events/event-payment/create-checkout-session");
      logger.info("- POST /events/events/register/:eventId");
      logger.info("- GET /events/:id");
      logger.info("\nPayment Routes:");
      logger.info("- POST /payments/membership-payment/create-checkout-session");
      logger.info("- GET /payments/member/payments");
      logger.info("- GET /payments/success");
      logger.info("- POST /payments/webhook");
      logger.info("\nAdmin Routes:");
      logger.info("- GET /admin/users");
      logger.info("- PATCH /admin/users/role/:email");
      logger.info("- DELETE /admin/users/:email");
      logger.info("- GET /admin/clubs");
      logger.info("- PATCH /admin/clubs/status/:clubId");
      logger.info("- DELETE /admin/clubs/:clubId");
      logger.info("\nManager Routes:");
      logger.info("- GET /manager/clubs");
      logger.info("- POST /manager/clubs");
      logger.info("- PATCH /manager/clubs/:id");
      logger.info("- DELETE /manager/clubs/:id");
      logger.info("- GET /manager/events");
      logger.info("- GET /manager/events/:eventId/registrations");
      logger.info("- POST /manager/events");
      logger.info("- PATCH /manager/events/:id");
      logger.info("- DELETE /manager/events/:id");
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
}

run().catch((error) => {
  logger.error("Server startup error:", error);
  process.exit(1);
});
