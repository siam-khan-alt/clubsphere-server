const { connectDatabase, getDatabase, getCollections, closeDatabase, client } = require("./database");
const { initializeFirebase, getFirebaseAdmin } = require("./firebase");
const { getStripeInstance, stripe } = require("./stripe");

module.exports = {
  // Database
  connectDatabase,
  getDatabase,
  getCollections,
  closeDatabase,
  client,
  
  // Firebase
  initializeFirebase,
  getFirebaseAdmin,
  
  // Stripe
  getStripeInstance,
  stripe,
};
