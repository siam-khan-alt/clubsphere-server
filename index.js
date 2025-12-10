const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const admin = require("firebase-admin");
const app = express();
const port = process.env.PORT || 5000;
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:5174"],
    credentials: true,
    optionSuccessStatus: 200,
  })
);
app.use(express.json());
require("dotenv").config();
const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf-8"
);
const serviceAccount = JSON.parse(decoded);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const verifyToken = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(" ")[1];
  console.log(token);
  if (!token) return res.status(401).send({ message: "Unauthorized Access!" });
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.tokenEmail = decoded.email;
    next();
  } catch (err) {
    console.log(err);
    return res.status(401).send({ message: "Unauthorized Access!", err });
  }
};

const uri = `${process.env.MONGODB_URI}`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
async function run() {
  try {
    await client.connect();
    const database = client.db("ClubSphereDB");
    const usersCollection = database.collection("users");
    const clubsCollection = database.collection("clubs");
    const membershipsCollection = database.collection("memberships");
    const eventsCollection = database.collection("events");
    const paymentsCollection = database.collection("payments");
    const eventRegistrationsCollection =
      database.collection("eventRegistrations");
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );

    const verifyAdmin = async (req, res, next) => {
      const email = req.tokenEmail;
      const user = await usersCollection.findOne({ email });

      if (!user || user.role !== "admin") {
        return res
          .status(403)
          .send({ message: "Forbidden access: Not an Admin." });
      }
      next();
    };
    const verifyManager = async (req, res, next) => {
      const email = req.tokenEmail;
      const user = await usersCollection.findOne({ email });

      if (!user || user.role !== "clubManager") {
        return res
          .status(403)
          .send({ message: "Forbidden access: Not an club manager." });
      }
      next();
    };

    app.post("/users/register", async (req, res) => {
      try {
        const { name, email, photoURL } = req.body;

        const existingUser = await usersCollection.findOne({ email });
        if (existingUser) {
          return res.status(200).send({
            message: "User already exists in DB",
            role: existingUser.role,
          });
        }

        const newUser = {
          name,
          email,
          photoURL,
          role: "member",
          createdAt: new Date(),
        };

        await usersCollection.insertOne(newUser);
        res.status(201).send({
          message: "User registered in DB successfully",
          role: "member",
        });
      } catch (error) {
        console.error("DB registration error:", error);
        res.status(500).send({
          message: "Failed to register user in DB",
          error: error.message,
        });
      }
    });

    app.get("/users/role", verifyToken, async (req, res) => {
      try {
        const email = req.tokenEmail;
        const user = await usersCollection.findOne(
          { email },
          { projection: { role: 1 } }
        );

        if (!user) {
          return res
            .status(404)
            .send({ message: "User not found in database." });
        }

        res.send({ role: user.role });
      } catch (error) {
        console.error("Role fetch error:", error);
        res
          .status(500)
          .send({ message: "Failed to fetch user role", error: error.message });
      }
    });
    app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.send(users);
      } catch (error) {
        console.error("Fetch all users error:", error);
        res
          .status(500)
          .send({ message: "Failed to fetch users from database." });
      }
    });

    app.patch(
      "/users/role/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const { email } = req.params;
        const { role } = req.body;

        if (
          !role ||
          (role !== "admin" && role !== "clubManager" && role !== "member")
        ) {
          return res.status(400).send({ message: "Invalid role specified." });
        }

        try {
          const updateResult = await usersCollection.updateOne(
            { email: email },
            { $set: { role: role } }
          );

          if (updateResult.modifiedCount === 0) {
            return res
              .status(404)
              .send({ message: "User not found or role already set." });
          }

          res.send({
            message: `${email} role updated to ${role} successfully.`,
          });
        } catch (error) {
          console.error("Update user role error:", error);
          res
            .status(500)
            .send({ message: "Failed to update user role in database." });
        }
      }
    );

    app.delete("/users/:email", verifyToken, verifyAdmin, async (req, res) => {
      const { email } = req.params;

      try {
        const userToDelete = await usersCollection.findOne({ email });

        if (!userToDelete) {
          return res
            .status(404)
            .send({ message: "User not found in database." });
        }

        const firebaseUser = await admin.auth().getUserByEmail(email);
        await admin.auth().deleteUser(firebaseUser.uid);

        const deleteResult = await usersCollection.deleteOne({ email });

        if (deleteResult.deletedCount === 0) {
          return res
            .status(500)
            .send({ message: "Failed to delete user from database." });
        }

        res.send({
          message: `${email} deleted successfully from Firebase and DB.`,
        });
      } catch (error) {
        console.error("Delete user error:", error);

        if (
          error.code === "auth/user-not-found" ||
          error.errorInfo?.code === "auth/user-not-found"
        ) {
          await usersCollection.deleteOne({ email });
          return res.json({
            message: `${email} deleted from DB (was missing in Firebase).`,
          });
        }

        res.status(500).send({
          message: "Failed to delete user. Check console for details.",
        });
      }
    });

    app.post("/clubs", verifyToken, verifyManager, async (req, res) => {
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
        console.error("Club creation error:", error);
        res.status(500).send({
          message: "Failed to submit club request due to server error.",
        });
      }
    });
    app.get("/admin/clubs", verifyToken, verifyAdmin, async (req, res) => {
      try {
        const clubs = await clubsCollection.find({}).toArray();

        const refinedClubs = clubs.map((club) => ({
          ...club,
          membersCount: club.members ? club.members.length : 0,
          eventsCount: club.eventsCount || 0,
          membershipFee: club.membershipFee || 0,
        }));

        res.send(refinedClubs);
      } catch (error) {
        console.error("Failed to fetch clubs for admin:", error);
        res.status(500).send({ message: "Could not retrieve club list." });
      }
    });

    app.patch(
      "/admin/clubs/status/:clubId",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const clubId = req.params.clubId;
        const { status } = req.body;

        if (!status || (status !== "approved" && status !== "rejected")) {
          return res.status(400).send({
            message:
              'Invalid status provided. Must be "approved" or "rejected".',
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
          console.error("Admin club status update error:", error);
          res.status(500).send({
            message: "Failed to update club status due to server error.",
          });
        }
      }
    );

    app.delete(
      "/admin/clubs/:clubId",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const clubId = req.params.clubId;

        if (!clubId) {
          return res
            .status(400)
            .send({ message: "Club ID is required for deletion." });
        }

        try {
          const result = await clubsCollection.deleteOne({
            _id: new ObjectId(clubId),
          });

          if (result.deletedCount === 0) {
            return res
              .status(404)
              .send({ message: "Club not found or already deleted." });
          }

          res.send({
            message: "Club deleted successfully.",
            deletedCount: result.deletedCount,
          });
        } catch (error) {
          console.error("Admin club deletion error:", error);
          res
            .status(500)
            .send({ message: "Failed to delete club due to server error." });
        }
      }
    );

    app.get("/manager/clubs", verifyToken, verifyManager, async (req, res) => {
      const managerEmail = req.tokenEmail;

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
        console.error("Failed to fetch clubs for manager:", error);
        res
          .status(500)
          .send({ message: "Could not retrieve manager club list." });
      }
    });

    app.patch("/clubs/:id", verifyToken, verifyManager, async (req, res) => {
      const clubId = req.params.id;
      const updateData = req.body;
      const managerEmail = req.tokenEmail;
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
          return res
            .status(404)
            .send({
              message: "Club not found or you are not authorized to manage it.",
            });
        }

        res.send({ message: "Club details updated successfully." });
      } catch (error) {
        console.error("Club update error:", error);
        res.status(500).send({ message: "Failed to update club." });
      }
    });

    app.delete("/clubs/:id", verifyToken, verifyManager, async (req, res) => {
      const clubId = req.params.id;
      const managerEmail = req.tokenEmail;
      try {
        const result = await clubsCollection.deleteOne({
          _id: new ObjectId(clubId),
          managerEmail: managerEmail,
        });

        if (result.deletedCount === 0) {
          return res
            .status(404)
            .send({
              message: "Club not found or you are not authorized to delete it.",
            });
        }

        res.send({ message: "Club deleted successfully." });
      } catch (error) {
        console.error("Club deletion error:", error);
        res.status(500).send({ message: "Failed to delete club." });
      }
    });

    app.get("/manager/stats", verifyToken, verifyManager, async (req, res) => {
      const managerEmail = req.tokenEmail;

      try {
        const managedClubs = await clubsCollection
          .find({ managerEmail: managerEmail, status: "approved" })
          .toArray();
        const managedClubIds = managedClubs.map((club) => club._id.toString());

        const totalClubs = managedClubs.length;

        const totalMembersResult = await membershipsCollection
          .aggregate([
            {
              $match: {
                clubId: { $in: managedClubIds },
                status: "active",
              },
            },
            {
              $group: {
                _id: null,
                totalMembers: { $sum: 1 },
              },
            },
          ])
          .toArray();
        const totalMembers = totalMembersResult[0]?.totalMembers || 0;

        const totalEventsResult = await eventsCollection
          .aggregate([
            {
              $match: {
                clubId: { $in: managedClubIds },
              },
            },
            {
              $group: {
                _id: null,
                totalEvents: { $sum: 1 },
              },
            },
          ])
          .toArray();
        const totalEvents = totalEventsResult[0]?.totalEvents || 0;

        const totalRevenueResult = await paymentsCollection
          .aggregate([
            {
              $match: {
                clubId: { $in: managedClubIds },
                paymentStatus: "paid",
              },
            },
            {
              $group: {
                _id: null,
                totalRevenue: { $sum: "$amount" },
              },
            },
          ])
          .toArray();
        const totalRevenue = totalRevenueResult[0]?.totalRevenue || 0;

        res.send({
          totalClubs,
          totalMembers,
          totalEvents,
          totalRevenue,
        });
      } catch (error) {
        console.error("Manager Stats fetch error:", error);
        res
          .status(500)
          .send({ message: "Failed to fetch manager statistics." });
      }
    });

    app.get(
      "/manager/clubs/:clubId/members",
      verifyToken,
      verifyManager,
      async (req, res) => {
        const managerEmail = req.tokenEmail;
        const clubId = req.params.clubId;

        try {
          const club = await clubsCollection.findOne(
            { _id: new ObjectId(clubId), managerEmail: managerEmail },
            { projection: { clubName: 1, _id: 0 } }
          );

          if (!club) {
            return res
              .status(403)
              .send({
                message:
                  "Forbidden: You do not manage this club or club not found.",
              });
          }

          const members = await membershipsCollection
            .find({ clubId: clubId })
            .toArray();

          res.send({
            clubName: club.clubName,
            members: members,
          });
        } catch (error) {
          console.error("Fetch club members error:", error);
          res
            .status(500)
            .send({ message: "Failed to retrieve club members list." });
        }
      }
    );

    app.patch(
      "/manager/memberships/:id",
      verifyToken,
      verifyManager,
      async (req, res) => {
        const membershipId = req.params.id;
        const { status } = req.body;
        const managerEmail = req.tokenEmail;

        if (status !== "expired") {
          return res
            .status(400)
            .send({ message: "Invalid status update request." });
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
            return res
              .status(403)
              .send({
                message:
                  "Forbidden: You are not authorized to modify this membership.",
              });
          }

          const updateResult = await membershipsCollection.updateOne(
            { _id: new ObjectId(membershipId) },
            { $set: { status: status, updatedAt: new Date() } }
          );

          if (updateResult.modifiedCount === 0) {
            return res
              .status(200)
              .send({ message: "Membership status already set to expired." });
          }

          res.send({ message: `Membership status updated to ${status}.` });
        } catch (error) {
          console.error("Update membership status error:", error);
          res
            .status(500)
            .send({ message: "Failed to update membership status." });
        }
      }
    );

    app.get("/manager/events", verifyToken, verifyManager, async (req, res) => {
      const managerEmail = req.tokenEmail;
      try {
        const managedClubs = await clubsCollection
          .find({ managerEmail: managerEmail })
          .toArray();
        const managedClubIds = managedClubs.map((club) => club._id.toString());

        const events = await eventsCollection
          .find({ clubId: { $in: managedClubIds } })
          .toArray();

        res.send(events);
      } catch (error) {
        console.error("Fetch manager events error:", error);
        res.status(500).send({ message: "Failed to retrieve events list." });
      }
    });

    app.get(
      "/manager/events/:eventId/registrations",
      verifyToken,
      verifyManager,
      async (req, res) => {
        const managerEmail = req.tokenEmail;
        const eventId = req.params.eventId;

        try {
          const event = await eventsCollection.findOne({
            _id: new ObjectId(eventId),
          });

          if (!event) {
            return res.status(404).send({ message: "Event not found." });
          }

          const club = await clubsCollection.findOne({
            _id: new ObjectId(event.clubId),
            managerEmail: managerEmail,
          });

          if (!club) {
            return res
              .status(403)
              .send({
                message:
                  "Forbidden: You do not manage the club for this event.",
              });
          }

          const registrations = await eventRegistrationsCollection
            .find({ eventId: eventId })
            .toArray();

          res.send({ eventTitle: event.title, registrations });
        } catch (error) {
          console.error("Fetch event registrations error:", error);
          res
            .status(500)
            .send({ message: "Failed to retrieve event registrations." });
        }
      }
    );

    app.post(
      "/manager/events",
      verifyToken,
      verifyManager,
      async (req, res) => {
        const managerEmail = req.tokenEmail;
        const {
          clubId,
          title,
          description,
          eventDate,
          eventTime,
          location,
          isPaid,
          eventFee,
          maxAttendees,
        } = req.body;

        if (!clubId || !title || !description || !eventDate || !location) {
          return res
            .status(400)
            .send({ message: "Please provide all required event details." });
        }

        try {
          const club = await clubsCollection.findOne({
            _id: new ObjectId(clubId),
            managerEmail: managerEmail,
            status: "approved",
          });
          if (!club) {
            return res
              .status(403)
              .send({
                message:
                  "Forbidden: Club not found, not approved, or you do not manage it.",
              });
          }

          const fee = isPaid === true ? parseFloat(eventFee) : 0;

          const newEvent = {
            clubId: clubId,
            clubName: club.clubName,
            title: title,
            description: description,
            eventDate: new Date(eventDate),
            eventTime: eventTime,
            location: location,
            isPaid: isPaid,
            eventFee: fee,
            maxAttendees: maxAttendees ? parseInt(maxAttendees) : null,
            registrationCount: 0,
            createdAt: new Date(),
            updatedAt: new Date(),
          };

          const result = await eventsCollection.insertOne(newEvent);

          await clubsCollection.updateOne(
            { _id: new ObjectId(clubId) },
            { $inc: { eventsCount: 1 } }
          );

          res
            .status(201)
            .send({
              message: "Event created successfully.",
              eventId: result.insertedId,
            });
        } catch (error) {
          console.error("Event creation error:", error);
          res
            .status(500)
            .send({ message: "Failed to create event due to server error." });
        }
      }
    );

    app.patch(
      "/manager/events/:id",
      verifyToken,
      verifyManager,
      async (req, res) => {
        const eventId = req.params.id;
        const managerEmail = req.tokenEmail;
        const updateData = req.body;

        try {
          const event = await eventsCollection.findOne({
            _id: new ObjectId(eventId),
          });
          if (!event) {
            return res.status(404).send({ message: "Event not found." });
          }

          const club = await clubsCollection.findOne({
            _id: new ObjectId(event.clubId),
            managerEmail: managerEmail,
          });
          if (!club) {
            return res
              .status(403)
              .send({
                message:
                  "Forbidden: You do not manage the club for this event.",
              });
          }

          const updateDoc = {
            $set: {
              title: updateData.title,
              description: updateData.description,
              eventDate: new Date(updateData.eventDate),
              eventTime: updateData.eventTime,
              location: updateData.location,
              isPaid: updateData.isPaid,
              eventFee: parseFloat(updateData.eventFee) || 0,
              maxAttendees: updateData.maxAttendees
                ? parseInt(updateData.maxAttendees)
                : null,
              updatedAt: new Date(),
            },
          };

          await eventsCollection.updateOne(
            { _id: new ObjectId(eventId) },
            updateDoc
          );

          res.send({ message: "Event updated successfully." });
        } catch (error) {
          console.error("Event update error:", error);
          res
            .status(500)
            .send({ message: "Failed to update event due to server error." });
        }
      }
    );

    app.delete(
      "/manager/events/:id",
      verifyToken,
      verifyManager,
      async (req, res) => {
        const eventId = req.params.id;
        const managerEmail = req.tokenEmail;

        try {
          const event = await eventsCollection.findOne({
            _id: new ObjectId(eventId),
          });
          if (!event) {
            return res.status(404).send({ message: "Event not found." });
          }

          const club = await clubsCollection.findOne({
            _id: new ObjectId(event.clubId),
            managerEmail: managerEmail,
          });
          if (!club) {
            return res
              .status(403)
              .send({
                message:
                  "Forbidden: You do not manage the club for this event.",
              });
          }

          await eventRegistrationsCollection.deleteMany({ eventId: eventId });
          await eventsCollection.deleteOne({ _id: new ObjectId(eventId) });

          await clubsCollection.updateOne(
            { _id: new ObjectId(event.clubId) },
            { $inc: { eventsCount: -1 } }
          );

          res.send({ message: "Event deleted successfully." });
        } catch (error) {
          console.error("Event deletion error:", error);
          res
            .status(500)
            .send({ message: "Failed to delete event due to server error." });
        }
      }
    );

    app.get("/", (req, res) => {
      res.send("Hello World!");
    });

    app.listen(port, () => {
      console.log(`Example app listening on port ${port}`);
    });
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);
