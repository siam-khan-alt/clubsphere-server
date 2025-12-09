const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
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
          return res
            .status(200)
            .send({
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
        res
          .status(201)
          .send({
            message: "User registered in DB successfully",
            role: "member",
          });
      } catch (error) {
        console.error("DB registration error:", error);
        res
          .status(500)
          .send({
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

    app.delete('/users/:email', verifyToken, verifyAdmin, async (req, res) => {
            const { email } = req.params;

            try {
                const userToDelete = await usersCollection.findOne({ email });

                if (!userToDelete) {
                    return res.status(404).send({ message: 'User not found in database.' });
                }
                
                const firebaseUser = await admin.auth().getUserByEmail(email);
                await admin.auth().deleteUser(firebaseUser.uid);
                
                const deleteResult = await usersCollection.deleteOne({ email });

                if (deleteResult.deletedCount === 0) {
                    return res.status(500).send({ message: 'Failed to delete user from database.' });
                }

                res.send({ message: `${email} deleted successfully from Firebase and DB.` });

            } catch (error) {
                console.error('Delete user error:', error);
                
                if (error.code === 'auth/user-not-found' || error.errorInfo?.code === 'auth/user-not-found') {
                    await usersCollection.deleteOne({ email });
                    return res.json({ message: `${email} deleted from DB (was missing in Firebase).` });
                }

                res.status(500).send({ message: 'Failed to delete user. Check console for details.' });
            }
        });

    app.post('/clubs', verifyToken, verifyManager, async (req, res) => {
    const { 
        name, 
        description, 
        category, 
        location,
        bannerImage,
        membershipFee,
        meetingSchedule 
    } = req.body;
    
    const managerEmail = req.tokenEmail; 

    if (!name || !description || !category || !location || membershipFee === undefined) {
        return res.status(400).send({ message: 'Please provide all required club information (Name, Description, Category, Location, Fee).' });
    }

    if (typeof membershipFee !== 'number' || membershipFee < 0) {
        return res.status(400).send({ message: 'Membership Fee must be a non-negative number.' });
    }

    try {
        const newClub = {
            clubName: name,
            description: description,
            category: category,
            location: location,
            bannerImage: bannerImage || null,
            membershipFee: membershipFee,
            meetingSchedule: meetingSchedule || 'TBD',
            managerEmail: managerEmail, 
            status: 'pending',
            members: [managerEmail],
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        const result = await clubsCollection.insertOne(newClub);

        res.status(201).json({ 
            message: 'Club creation request submitted successfully! Awaiting Admin approval.', 
            clubId: result.insertedId,
            club: newClub 
        });

    } catch (error) {
        console.error('Club creation error:', error);
        res.status(500).send({ message: 'Failed to submit club request due to server error.' });
    }
});    
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
