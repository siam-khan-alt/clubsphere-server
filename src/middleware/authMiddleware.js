const { getFirebaseAdmin, getCollections } = require("../config");

const admin = getFirebaseAdmin();

/**
 * Verify Firebase ID token and attach user email to request
 */
const verifyToken = async (req, res, next) => {
  const token = req?.headers?.authorization?.split(" ")[1];
  
  if (!token) {
    return res.status(401).send({ message: "Unauthorized Access!" });
  }
  
  try {
    const decoded = await admin.auth().verifyIdToken(token);
    req.tokenEmail = decoded.email;
    next();
  } catch (err) {
    return res.status(401).send({ message: "Unauthorized Access!", err });
  }
};

/**
 * Verify user has admin role
 */
const verifyAdmin = async (req, res, next) => {
  const email = req.tokenEmail;
  const { usersCollection } = getCollections();

  try {
    const user = await usersCollection.findOne({ email });

    if (!user || user.role !== "admin") {
      return res
        .status(403)
        .send({ message: "Forbidden access: Not an Admin." });
    }
    next();
  } catch (error) {
    return res.status(500).send({ message: "Error verifying admin role." });
  }
};

/**
 * Verify user has club manager role
 */
const verifyManager = async (req, res, next) => {
  const email = req.tokenEmail;
  const { usersCollection } = getCollections();

  try {
    const user = await usersCollection.findOne({ email });

    if (!user || user.role !== "clubManager") {
      return res
        .status(403)
        .send({ message: "Forbidden access: Not a club manager." });
    }
    next();
  } catch (error) {
    return res.status(500).send({ message: "Error verifying manager role." });
  }
};

/**
 * Verify user has member role
 */
const verifyMember = async (req, res, next) => {
  const email = req.tokenEmail;
  const { usersCollection } = getCollections();

  try {
    const user = await usersCollection.findOne({ email });

    if (!user || user.role !== "member") {
      return res
        .status(403)
        .send({ message: "Forbidden access: Not a club member." });
    }
    next();
  } catch (error) {
    return res.status(500).send({ message: "Error verifying member role." });
  }
};

module.exports = {
  verifyToken,
  verifyAdmin,
  verifyManager,
  verifyMember,
};
