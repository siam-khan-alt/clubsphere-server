require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { connectDatabase, getCollections, getFirebaseAdmin } = require("./src/config");
const { verifyToken, verifyAdmin, verifyManager, verifyMember } = require("./src/middleware/authMiddleware");
const { generalLimiter, authLimiter, publicLimiter, webhookLimiter } = require("./src/middleware/rateLimiter");
const { errorHandler, notFoundHandler } = require("./src/middleware/errorHandler");
const logger = require("./src/config/logger");
const emailService = require("./src/utils/emailService");
const { startMembershipExpirationJob } = require("./src/jobs/membershipExpirationJob");
const { startAchievementJob } = require("./src/jobs/achievementJob");
const userRoutes = require("./src/routes/userRoutes");
const clubRoutes = require("./src/routes/clubRoutes");
const eventRoutes = require("./src/routes/eventRoutes");
const { router: paymentRoutes, webhookRouter } = require("./src/routes/paymentRoutes");
const adminRoutes = require("./src/routes/adminRoutes");
const managerRoutes = require("./src/routes/managerRoutes");
const notificationRoutes = require("./src/routes/notificationRoutes");
const subscriptionRoutes = require("./src/routes/subscriptionRoutes");
const referralRoutes = require("./src/routes/referralRoutes");
const achievementRoutes = require("./src/routes/achievementRoutes");
const chatRoutes = require("./src/routes/chatRoutes");
const { saveMessage } = require("./src/controllers/chatController");

const app = express();
const port = process.env.PORT || 5000;

// Create HTTP server for Socket.io
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "https://clubsphere-client.vercel.app",
    ],
    credentials: true,
  },
});

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

logger.info("- /notifications -> notificationRoutes (general limiter)");
app.use("/notifications", generalLimiter, notificationRoutes);

logger.info("- /subscriptions -> subscriptionRoutes (general limiter)");
app.use("/subscriptions", generalLimiter, subscriptionRoutes);

logger.info("- /referrals -> referralRoutes (general limiter)");
app.use("/referrals", generalLimiter, referralRoutes);

logger.info("- /achievements -> achievementRoutes (general limiter)");
app.use("/achievements", generalLimiter, achievementRoutes);

logger.info("- /chat -> chatRoutes (general limiter)");
app.use("/chat", generalLimiter, chatRoutes);

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

// Socket.io connection handling
io.on("connection", (socket) => {
  logger.info(`User connected: ${socket.id}`);

  // Join a chat room
  socket.on("join_room", (roomId) => {
    socket.join(roomId);
    logger.info(`Socket ${socket.id} joined room ${roomId}`);
  });

  // Send a message to a room
  socket.on("send_message", async (data) => {
    try {
      const { roomId, senderEmail, messageText } = data;

      // Save message to database
      const newMessage = await saveMessage(roomId, senderEmail, messageText);

      // Broadcast message to all users in the room
      io.to(roomId).emit("receive_message", newMessage);

      logger.info(`Message sent to room ${roomId} by ${senderEmail}`);
    } catch (error) {
      logger.error("Error sending message:", error);
      socket.emit("error", { message: "Failed to send message" });
    }
  });

  // Leave a room
  socket.on("leave_room", (roomId) => {
    socket.leave(roomId);
    logger.info(`Socket ${socket.id} left room ${roomId}`);
  });

  // Disconnect
  socket.on("disconnect", () => {
    logger.info(`User disconnected: ${socket.id}`);
  });
});

async function run() {
  try {
    await connectDatabase();
    logger.info("Database connected successfully.");

    // Initialize email service
    emailService.initialize();

    // Start membership expiration job
    startMembershipExpirationJob();

    // Start achievement job
    startAchievementJob();

    server.listen(port, () => {
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
      logger.info("- GET /events/:id/calendar");
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
      logger.info("\nNotification Routes:");
      logger.info("- GET /notifications/");
      logger.info("- PATCH /notifications/:notificationId/read");
      logger.info("- PATCH /notifications/read-all");
      logger.info("- DELETE /notifications/:notificationId");
      logger.info("\nChat Routes:");
      logger.info("- GET /chat/rooms");
      logger.info("- GET /chat/rooms/:roomId/messages");
      logger.info("- POST /chat/rooms/direct");
      logger.info("\nSocket.io Events:");
      logger.info("- join_room");
      logger.info("- send_message");
      logger.info("- leave_room");
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
