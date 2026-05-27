const admin = require("firebase-admin");

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf-8"
);
const serviceAccount = JSON.parse(decoded);

const initializeFirebase = () => {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    console.log("Firebase Admin SDK initialized successfully.");
  }
  return admin;
};

const getFirebaseAdmin = () => {
  if (!admin.apps.length) {
    initializeFirebase();
  }
  return admin;
};

module.exports = {
  initializeFirebase,
  getFirebaseAdmin,
};
