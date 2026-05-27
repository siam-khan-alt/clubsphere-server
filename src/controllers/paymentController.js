const { ObjectId } = require("mongodb");
const { getCollections, stripe, startSession } = require("../config");
const logger = require("../config/logger");

/**
 * Create membership checkout session (member only)
 */
const createMembershipCheckoutSession = async (req, res) => {
  const { clubId, userEmail } = req.body;
  const callingEmail = req.tokenEmail;
  const { clubsCollection, membershipsCollection } = getCollections();

  if (callingEmail !== userEmail) {
    return res
      .status(403)
      .send({ message: "Emails do not match. Unauthorized." });
  }

  if (!clubId || !userEmail) {
    return res
      .status(400)
      .send({ message: "Missing club ID or user email." });
  }

  try {
    const club = await clubsCollection.findOne({
      _id: new ObjectId(clubId),
      status: "approved",
    });

    if (!club) {
      return res
        .status(404)
        .send({ message: "Club not found or not approved." });
    }

    if (club.membershipFee === 0 || !club.membershipFee) {
      return res
        .status(400)
        .send({ message: "This club has free membership." });
    }

    const existingMembership = await membershipsCollection.findOne({
      clubId: clubId,
      userEmail: userEmail,
      status: "active",
    });

    if (existingMembership) {
      return res.status(400).send({
        message: "You are already an active member of this club.",
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${club.clubName} Membership`,
              description: `Membership for ${club.clubName}.`,
            },
            unit_amount: Math.round(club.membershipFee * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      metadata: {
        clubId: clubId,
        userEmail: userEmail,
        amount: club.membershipFee.toString(),
        type: "membership",
      },
      success_url: `${process.env.CLIENT_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}&type=membership`,
      cancel_url: `${process.env.CLIENT_URL}/clubs/${clubId}`,
    });

    res.send({ url: session.url });
  } catch (error) {
    logger.error("Stripe Membership Checkout Session Error:", error);
    res
      .status(500)
      .send({ message: "Failed to create payment session for membership." });
  }
};

/**
 * Stripe webhook handler
 */
const handleStripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const { clubsCollection, membershipsCollection, eventRegistrationsCollection, paymentsCollection, eventsCollection } = getCollections();

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    logger.error(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  logger.info(`Received Stripe webhook event: ${event.type}`);

  // Handle checkout.session.completed (existing logic)
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const metadata = session.metadata;

    if (metadata.type === "membership") {
      try {
        const clubId = metadata.clubId;
        const userEmail = metadata.userEmail;
        const amount = parseFloat(metadata.amount);

        const dbSession = await startSession();
        try {
          await dbSession.withTransaction(async () => {
            const existingMembership = await membershipsCollection.findOne(
              { clubId: clubId, userEmail: userEmail, status: "active" },
              { session: dbSession }
            );

            if (!existingMembership) {
              const newMembership = {
                userEmail: userEmail,
                clubId: clubId,
                status: "active",
                paymentId: session.payment_intent,
                joinedAt: new Date(),
                expiresAt: null,
              };
              await membershipsCollection.insertOne(newMembership, { session: dbSession });

              await clubsCollection.updateOne(
                { _id: new ObjectId(clubId) },
                { $addToSet: { members: userEmail } },
                { session: dbSession }
              );
            }

            const paymentRecord = {
              userEmail: userEmail,
              clubId: clubId,
              amount: amount,
              paymentId: session.payment_intent,
              sessionId: session.id,
              status: "completed",
              type: "membership",
              createdAt: new Date(),
            };
            await paymentsCollection.insertOne(paymentRecord, { session: dbSession });
          });
        } finally {
          await dbSession.endSession();
        }

        logger.info(
          `Membership payment processed for ${userEmail} in club ${clubId}`
        );
      } catch (error) {
        logger.error("Error processing membership webhook:", error);
      }
    } else if (metadata.type === "event") {
      try {
        const eventId = metadata.eventId;
        const userEmail = metadata.userEmail;
        const amount = parseFloat(metadata.amount);
        const clubId = metadata.clubId;

        const dbSession = await startSession();
        try {
          await dbSession.withTransaction(async () => {
            const existingRegistration = await eventRegistrationsCollection.findOne(
              { eventId: eventId, userEmail: userEmail, status: "registered" },
              { session: dbSession }
            );

            if (!existingRegistration) {
              const newRegistration = {
                userEmail: userEmail,
                eventId: eventId,
                clubId: clubId,
                status: "registered",
                amount: amount,
                paymentStatus: "paid",
                paymentId: session.payment_intent,
                registeredAt: new Date(),
              };
              await eventRegistrationsCollection.insertOne(newRegistration, { session: dbSession });

              await eventsCollection.updateOne(
                { _id: new ObjectId(eventId) },
                { $inc: { registrationCount: 1 } },
                { session: dbSession }
              );
            }

            const paymentRecord = {
              userEmail: userEmail,
              eventId: eventId,
              clubId: clubId,
              amount: amount,
              paymentId: session.payment_intent,
              sessionId: session.id,
              status: "completed",
              type: "event",
              createdAt: new Date(),
            };
            await paymentsCollection.insertOne(paymentRecord, { session: dbSession });
          });
        } finally {
          await dbSession.endSession();
        }

        logger.info(
          `Event payment processed for ${userEmail} for event ${eventId}`
        );
      } catch (error) {
        logger.error("Error processing event webhook:", error);
      }
    }
  }

  // Handle invoice.payment_failed
  if (event.type === "invoice.payment_failed") {
    const invoice = event.data.object;
    const subscriptionId = invoice.subscription;

    try {
      const club = await clubsCollection.findOne({ stripeSubscriptionId: subscriptionId });

      if (club) {
        logger.warn(`Payment failed for club ${club._id}, subscription ${subscriptionId}`);

        // Update club subscription status to indicate payment failure
        await clubsCollection.updateOne(
          { _id: club._id },
          {
            $set: {
              subscriptionStatus: "payment_failed",
              lastPaymentFailedAt: new Date(),
              updatedAt: new Date(),
            },
          }
        );

        // TODO: Send notification to manager about payment failure
        logger.info(`Updated club ${club._id} status to payment_failed`);
      }
    } catch (error) {
      logger.error("Error processing invoice.payment_failed webhook:", error);
    }
  }

  // Handle customer.subscription.deleted
  if (event.type === "customer.subscription.deleted") {
    const subscription = event.data.object;
    const subscriptionId = subscription.id;

    try {
      const club = await clubsCollection.findOne({ stripeSubscriptionId: subscriptionId });

      if (club) {
        logger.info(`Subscription ${subscriptionId} deleted for club ${club._id}`);

        const dbSession = await startSession();
        try {
          await dbSession.withTransaction(async () => {
            await clubsCollection.updateOne(
              { _id: club._id },
              {
                $set: {
                  subscriptionStatus: "cancelled",
                  subscriptionExpiresAt: new Date(), // Set expiration to now
                  stripeSubscriptionId: null,
                  updatedAt: new Date(),
                },
              },
              { session: dbSession }
            );
          });
        } finally {
          await dbSession.endSession();
        }

        logger.info(`Updated club ${club._id} subscription status to cancelled`);
      }
    } catch (error) {
      logger.error("Error processing customer.subscription.deleted webhook:", error);
    }
  }

  // Handle invoice.payment_succeeded
  if (event.type === "invoice.payment_succeeded") {
    const invoice = event.data.object;
    const subscriptionId = invoice.subscription;

    try {
      const club = await clubsCollection.findOne({ stripeSubscriptionId: subscriptionId });

      if (club) {
        logger.info(`Payment succeeded for club ${club._id}, subscription ${subscriptionId}`);

        // Calculate new expiration date (30 days from now)
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        const dbSession = await startSession();
        try {
          await dbSession.withTransaction(async () => {
            await clubsCollection.updateOne(
              { _id: club._id },
              {
                $set: {
                  subscriptionStatus: "active",
                  subscriptionExpiresAt: expiresAt,
                  lastPaymentSucceededAt: new Date(),
                  updatedAt: new Date(),
                },
              },
              { session: dbSession }
            );
          });
        } finally {
          await dbSession.endSession();
        }

        logger.info(`Extended subscription for club ${club._id} to ${expiresAt}`);
      }
    } catch (error) {
      logger.error("Error processing invoice.payment_succeeded webhook:", error);
    }
  }

  // Handle customer.subscription.updated
  if (event.type === "customer.subscription.updated") {
    const subscription = event.data.object;
    const subscriptionId = subscription.id;

    try {
      const club = await clubsCollection.findOne({ stripeSubscriptionId: subscriptionId });

      if (club) {
        logger.info(`Subscription ${subscriptionId} updated for club ${club._id}`);

        // Extract plan from subscription metadata or items
        const planId = subscription.metadata?.planId || "basic";

        const dbSession = await startSession();
        try {
          await dbSession.withTransaction(async () => {
            await clubsCollection.updateOne(
              { _id: club._id },
              {
                $set: {
                  subscriptionPlan: planId,
                  subscriptionStatus: subscription.status === "active" ? "active" : "inactive",
                  updatedAt: new Date(),
                },
              },
              { session: dbSession }
            );
          });
        } finally {
          await dbSession.endSession();
        }

        logger.info(`Updated club ${club._id} subscription plan to ${planId}`);
      }
    } catch (error) {
      logger.error("Error processing customer.subscription.updated webhook:", error);
    }
  }

  res.status(200).json({ received: true });
};

/**
 * Get member's payment history (member only)
 */
const getMemberPayments = async (req, res) => {
  const userEmail = req.tokenEmail;
  const { paymentsCollection, clubsCollection, eventsCollection } = getCollections();

  try {
    const payments = await paymentsCollection
      .find({ userEmail: userEmail })
      .sort({ createdAt: -1 })
      .toArray();

    const result = await Promise.all(
      payments.map(async (payment) => {
        let details = {};
        if (payment.type === "membership" && payment.clubId) {
          const club = await clubsCollection.findOne(
            { _id: new ObjectId(payment.clubId) },
            { projection: { clubName: 1, bannerImage: 1 } }
          );
          details.clubName = club?.clubName || "Unknown Club";
          details.bannerImage = club?.bannerImage || "";
        } else if (payment.type === "event" && payment.eventId) {
          const event = await eventsCollection.findOne(
            { _id: new ObjectId(payment.eventId) },
            { projection: { title: 1, bannerImage: 1 } }
          );
          details.eventTitle = event?.title || "Unknown Event";
          details.bannerImage = event?.bannerImage || "";
        }
        return { ...payment, ...details };
      })
    );

    res.send(result);
  } catch (error) {
    logger.error("Error fetching member payments:", error);
    res.status(500).send({ message: "Failed to fetch payment history." });
  }
};

/**
 * Verify payment success (public)
 */
const verifyPaymentSuccess = async (req, res) => {
  const { session_id } = req.query;
  const { paymentsCollection } = getCollections();

  if (!session_id) {
    return res.status(400).send({ message: "Session ID is required." });
  }

  try {
    const payment = await paymentsCollection.findOne({
      sessionId: session_id,
      status: "completed",
    });

    if (!payment) {
      return res.status(404).send({ message: "Payment not found." });
    }

    res.send({
      type: payment.type,
      clubId: payment.clubId,
      eventId: payment.eventId,
    });
  } catch (error) {
    logger.error("Error verifying payment:", error);
    res.status(500).send({ message: "Failed to verify payment." });
  }
};

/**
 * Get all payments (admin only)
 */
const getAdminPayments = async (req, res) => {
  const { paymentsCollection, clubsCollection, eventsCollection, usersCollection } = getCollections();

  try {
    const payments = await paymentsCollection
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    const result = await Promise.all(
      payments.map(async (payment) => {
        let details = {};
        if (payment.type === "membership" && payment.clubId) {
          const club = await clubsCollection.findOne(
            { _id: new ObjectId(payment.clubId) },
            { projection: { clubName: 1 } }
          );
          details.clubName = club?.clubName || "Unknown Club";
        } else if (payment.type === "event" && payment.eventId) {
          const event = await eventsCollection.findOne(
            { _id: new ObjectId(payment.eventId) },
            { projection: { title: 1 } }
          );
          details.eventTitle = event?.title || "Unknown Event";
        }
        return { ...payment, ...details };
      })
    );

    res.send(result);
  } catch (error) {
    logger.error("Error fetching admin payments:", error);
    res.status(500).send({ message: "Failed to fetch payments." });
  }
};

module.exports = {
  createMembershipCheckoutSession,
  handleStripeWebhook,
  getMemberPayments,
  verifyPaymentSuccess,
  getAdminPayments,
};
