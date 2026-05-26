const { ObjectId } = require("mongodb");
const { getCollections, stripe } = require("../config");

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
    console.error("Stripe Membership Checkout Session Error:", error);
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
  const { clubsCollection, membershipsCollection, eventRegistrationsCollection, paymentsCollection } = getCollections();

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.log(`Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const metadata = session.metadata;

    if (metadata.type === "membership") {
      try {
        const clubId = metadata.clubId;
        const userEmail = metadata.userEmail;
        const amount = parseFloat(metadata.amount);

        const existingMembership = await membershipsCollection.findOne({
          clubId: clubId,
          userEmail: userEmail,
          status: "active",
        });

        if (!existingMembership) {
          const newMembership = {
            userEmail: userEmail,
            clubId: clubId,
            status: "active",
            paymentId: session.payment_intent,
            joinedAt: new Date(),
            expiresAt: null,
          };
          await membershipsCollection.insertOne(newMembership);

          await clubsCollection.updateOne(
            { _id: new ObjectId(clubId) },
            { $addToSet: { members: userEmail } }
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
        await paymentsCollection.insertOne(paymentRecord);

        console.log(
          `Membership payment processed for ${userEmail} in club ${clubId}`
        );
      } catch (error) {
        console.error("Error processing membership webhook:", error);
      }
    } else if (metadata.type === "event") {
      try {
        const eventId = metadata.eventId;
        const userEmail = metadata.userEmail;
        const amount = parseFloat(metadata.amount);
        const clubId = metadata.clubId;

        const existingRegistration =
          await eventRegistrationsCollection.findOne({
            eventId: eventId,
            userEmail: userEmail,
            status: "registered",
          });

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
          await eventRegistrationsCollection.insertOne(newRegistration);

          await eventsCollection.updateOne(
            { _id: new ObjectId(eventId) },
            { $inc: { registrationCount: 1 } }
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
        await paymentsCollection.insertOne(paymentRecord);

        console.log(
          `Event payment processed for ${userEmail} for event ${eventId}`
        );
      } catch (error) {
        console.error("Error processing event webhook:", error);
      }
    }
  }

  res.status(200).json({ received: true });
};

module.exports = {
  createMembershipCheckoutSession,
  handleStripeWebhook,
};
