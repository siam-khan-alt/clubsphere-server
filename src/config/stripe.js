const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const getStripeInstance = () => {
  return stripe;
};

module.exports = {
  getStripeInstance,
  stripe,
};
