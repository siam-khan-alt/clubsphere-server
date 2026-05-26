const { ObjectId } = require("mongodb");
const { getCollections, getFirebaseAdmin } = require("../config");

const admin = getFirebaseAdmin();

/**
 * Register a new user in the database
 */
const registerUser = async (req, res) => {
  try {
    const { name, email, photoURL } = req.body;
    const { usersCollection } = getCollections();

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
};

/**
 * Handle Google login (create user if doesn't exist)
 */
const googleLogin = async (req, res) => {
  try {
    const { name, email, photoURL } = req.body;
    const { usersCollection } = getCollections();

    let user = await usersCollection.findOne({ email });

    if (!user) {
      const newUser = {
        name,
        email,
        photoURL,
        role: "member",
        createdAt: new Date(),
      };
      const result = await usersCollection.insertOne(newUser);
      user = { ...newUser, _id: result.insertedId };
    }

    res.status(200).send({
      message: "User handled successfully",
      role: user.role,
    });
  } catch (error) {
    res.status(500).send({ message: "Server error", error: error.message });
  }
};

/**
 * Update user profile
 */
const updateUser = async (req, res) => {
  try {
    const { email, name, photoURL } = req.body;
    const { usersCollection } = getCollections();
    const filter = { email: email };
    const updatedDoc = {
      $set: {
        name: name,
        photoURL: photoURL,
      },
    };
    const result = await usersCollection.updateOne(filter, updatedDoc);
    res.send(result);
  } catch (error) {
    res
      .status(500)
      .send({ message: "Update failed", error: error.message });
  }
};

/**
 * Get user role (authenticated)
 */
const getUserRole = async (req, res) => {
  try {
    const email = req.tokenEmail;
    const { usersCollection } = getCollections();
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
};

/**
 * Get all users (admin only)
 */
const getAllUsers = async (req, res) => {
  try {
    const { usersCollection } = getCollections();
    const users = await usersCollection.find().toArray();
    res.send(users);
  } catch (error) {
    console.error("Fetch all users error:", error);
    res
      .status(500)
      .send({ message: "Failed to fetch users from database." });
  }
};

/**
 * Update user role (admin only)
 */
const updateUserRole = async (req, res) => {
  const { email } = req.params;
  const { role } = req.body;
  const { usersCollection } = getCollections();

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
};

/**
 * Delete user (admin only)
 */
const deleteUser = async (req, res) => {
  const { email } = req.params;
  const { usersCollection } = getCollections();

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
};

module.exports = {
  registerUser,
  googleLogin,
  updateUser,
  getUserRole,
  getAllUsers,
  updateUserRole,
  deleteUser,
};
