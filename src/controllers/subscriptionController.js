const { ObjectId } = require("mongodb");
const { getCollections, stripe } = require("../config");
const logger = require("../config/logger");

/**
 * Create a Stripe subscription checkout session for club
 */
const createSubscriptionCheckout = async (req, res) => {
  try {
    const { clubId, planId } = req.body;
    const managerEmail = req.tokenEmail;
    const { clubsCollection } = getCollections();

    // Verify club ownership
    const club = await clubsCollection.findOne({
      _id: new ObjectId(clubId),
      managerEmail: managerEmail,
    });

    if (!club) {
      return res.status(403).send({ message: "You are not authorized to manage this club." });
    }

    // Define subscription plans
    const plans = {
      basic: {
        name: "Basic",
        price: 0,
        features: ["Up to 50 members", "Up to 5 events/month", "Basic analytics"],
      },
      pro: {
        name: "Pro",
        price: 2999, // $29.99 in cents
        features: ["Up to 200 members", "Up to 20 events/month", "Advanced analytics", "Priority support"],
      },
      enterprise: {
        name: "Enterprise",
        price: 9999, // $99.99 in cents
        features: ["Unlimited members", "Unlimited events", "Custom branding", "Dedicated support", "API access"],
      },
    };

    const selectedPlan = plans[planId];
    if (!selectedPlan) {
      return res.status(400).send({ message: "Invalid plan selected." });
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${selectedPlan.name} Plan - ${club.clubName}`,
              description: selectedPlan.features.join(", "),
            },
            unit_amount: selectedPlan.price,
            recurring: {
              interval: "month",
            },
          },
          quantity: 1,
        },
      ],
      mode: "subscription",
      success_url: `${process.env.CLIENT_URL || "http://localhost:5173"}/dashboard/manager/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL || "http://localhost:5173"}/dashboard/manager/pricing`,
      metadata: {
        clubId: clubId,
        planId: planId,
        type: "club_subscription",
      },
    });

    res.send({ url: session.url, sessionId: session.id });
  } catch (error) {
    logger.error("Error creating subscription checkout:", error);
    res.status(500).send({ message: "Failed to create subscription checkout." });
  }
};

/**
 * Handle successful subscription payment
 */
const handleSubscriptionSuccess = async (req, res) => {
  try {
    const { session_id } = req.query;
    const { clubsCollection } = getCollections();

    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (!session.metadata || session.metadata.type !== "club_subscription") {
      return res.status(400).send({ message: "Invalid session type." });
    }

    const { clubId, planId } = session.metadata;

    // Calculate subscription expiration (30 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    // Update club with subscription details
    await clubsCollection.updateOne(
      { _id: new ObjectId(clubId) },
      {
        $set: {
          subscriptionPlan: planId,
          subscriptionStatus: "active",
          subscriptionExpiresAt: expiresAt,
          stripeSubscriptionId: session.subscription,
          updatedAt: new Date(),
        },
      }
    );

    res.send({
      message: "Subscription activated successfully",
      plan: planId,
      expiresAt: expiresAt.toISOString(),
    });
  } catch (error) {
    logger.error("Error handling subscription success:", error);
    res.status(500).send({ message: "Failed to activate subscription." });
  }
};

/**
 * Get club subscription status
 */
const getSubscriptionStatus = async (req, res) => {
  try {
    const { clubId } = req.params;
    const managerEmail = req.tokenEmail;
    const { clubsCollection } = getCollections();

    const club = await clubsCollection.findOne({
      _id: new ObjectId(clubId),
      managerEmail: managerEmail,
    });

    if (!club) {
      return res.status(403).send({ message: "You are not authorized to view this club." });
    }

    const subscription = {
      plan: club.subscriptionPlan || "basic",
      status: club.subscriptionStatus || "inactive",
      expiresAt: club.subscriptionExpiresAt || null,
      stripeSubscriptionId: club.stripeSubscriptionId || null,
    };

    // Check if subscription is expired
    if (subscription.expiresAt && new Date(subscription.expiresAt) < new Date()) {
      subscription.status = "expired";
    }

    res.send(subscription);
  } catch (error) {
    logger.error("Error getting subscription status:", error);
    res.status(500).send({ message: "Failed to get subscription status." });
  }
};

/**
 * Cancel subscription
 */
const cancelSubscription = async (req, res) => {
  try {
    const { clubId } = req.params;
    const managerEmail = req.tokenEmail;
    const { clubsCollection } = getCollections();

    const club = await clubsCollection.findOne({
      _id: new ObjectId(clubId),
      managerEmail: managerEmail,
    });

    if (!club) {
      return res.status(403).send({ message: "You are not authorized to manage this club." });
    }

    if (!club.stripeSubscriptionId) {
      return res.status(400).send({ message: "No active subscription found." });
    }

    // Cancel Stripe subscription
    await stripe.subscriptions.cancel(club.stripeSubscriptionId);

    // Update club subscription status
    await clubsCollection.updateOne(
      { _id: new ObjectId(clubId) },
      {
        $set: {
          subscriptionStatus: "cancelled",
          subscriptionExpiresAt: club.subscriptionExpiresAt, // Keep existing expiration
          updatedAt: new Date(),
        },
      }
    );

    res.send({ message: "Subscription cancelled successfully" });
  } catch (error) {
    logger.error("Error cancelling subscription:", error);
    res.status(500).send({ message: "Failed to cancel subscription." });
  }
};

module.exports = {
  createSubscriptionCheckout,
  handleSubscriptionSuccess,
  getSubscriptionStatus,
  cancelSubscription,
};
