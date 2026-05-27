const { ObjectId } = require("mongodb");
const { getCollections, stripe } = require("../config");

/**
 * Get manager's events (manager only)
 */
const getManagerEvents = async (req, res) => {
  const managerEmail = req.tokenEmail;
  const { clubsCollection, eventsCollection } = getCollections();

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
};

/**
 * Get event registrations (manager only)
 */
const getEventRegistrations = async (req, res) => {
  const managerEmail = req.tokenEmail;
  const eventId = req.params.eventId;
  const { eventsCollection, clubsCollection, eventRegistrationsCollection } = getCollections();

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
      return res.status(403).send({
        message: "Forbidden: You do not manage the club for this event.",
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
};

/**
 * Create event (manager only)
 */
const createEvent = async (req, res) => {
  const managerEmail = req.tokenEmail;
  const {
    clubId,
    title,
    description,
    eventDate,
    location,
    isPaid,
    eventFee,
    maxAttendees,
    bannerImage,
  } = req.body;

  const { clubsCollection, eventsCollection } = getCollections();

  if (
    !clubId ||
    !title ||
    !description ||
    !eventDate ||
    !location ||
    !bannerImage
  ) {
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
      return res.status(403).send({
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
      bannerImage: bannerImage,
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

    res.status(201).send({
      message: "Event created successfully.",
      eventId: result.insertedId,
    });
  } catch (error) {
    console.error("Event creation error:", error);
    res
      .status(500)
      .send({ message: "Failed to create event due to server error." });
  }
};

/**
 * Update event (manager only)
 */
const updateEvent = async (req, res) => {
  const eventId = req.params.id;
  const managerEmail = req.tokenEmail;
  const {
    eventDate,
    eventTime,
    isPaid,
    eventFee,
    maxAttendees,
    title,
    description,
    location,
    bannerImage,
  } = req.body;

  const { eventsCollection, clubsCollection } = getCollections();

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
      return res.status(403).send({
        message: "Forbidden: You do not manage the club for this event.",
      });
    }

    const updateDoc = {
      $set: {
        title: title,
        description: description,
        eventDate: new Date(eventDate),
        location: location,
        bannerImage: bannerImage,
        isPaid: isPaid,
        eventFee: parseFloat(eventFee) || 0,
        maxAttendees: maxAttendees ? parseInt(maxAttendees) : null,
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
};

/**
 * Delete event (manager only)
 */
const deleteEvent = async (req, res) => {
  const eventId = req.params.id;
  const managerEmail = req.tokenEmail;
  const { eventsCollection, clubsCollection, eventRegistrationsCollection } = getCollections();

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
      return res.status(403).send({
        message: "Forbidden: You do not manage the club for this event.",
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
};

/**
 * Public event listing
 */
const getPublicEvents = async (req, res) => {
  const { search, sort, order } = req.query;
  const { eventsCollection, clubsCollection } = getCollections();
  let query = {};
  let sortOptions = {};

  if (search) {
    query.title = { $regex: search, $options: "i" };
  }

  if (sort) {
    sortOptions[sort] = order === "asc" ? 1 : -1;
  } else {
    sortOptions.eventDate = -1;
  }

  try {
    const eventsList = await eventsCollection
      .find(query)
      .sort(sortOptions)
      .toArray();

    const clubIds = eventsList.map((event) => new ObjectId(event.clubId));

    const clubs = await clubsCollection
      .find(
        { _id: { $in: clubIds } },
        { projection: { clubName: 1, _id: 1, category: 1 } }
      )
      .toArray();

    const clubMap = clubs.reduce((acc, club) => {
      acc[club._id.toString()] = club;
      return acc;
    }, {});

    const result = eventsList.map((event) => ({
      ...event,
      clubDetails: clubMap[event.clubId] || {
        clubName: "Unknown Club",
        category: "N/A",
      },
    }));

    res.send(result);
  } catch (error) {
    console.error("Error fetching public events:", error);
    res.status(500).send({ message: "Failed to fetch events." });
  }
};

/**
 * Get event details (public)
 */
const getEventById = async (req, res) => {
  const eventId = req.params.id;
  const { eventsCollection, clubsCollection } = getCollections();

  if (!ObjectId.isValid(eventId)) {
    return res.status(400).send({ message: "Invalid Event ID format." });
  }

  try {
    const event = await eventsCollection.findOne({
      _id: new ObjectId(eventId),
    });

    if (!event) {
      return res.status(404).send({ message: "Event not found." });
    }

    const clubDetails = await clubsCollection.findOne(
      { _id: new ObjectId(event.clubId) },
      { projection: { clubName: 1, managerEmail: 1 } }
    );
    event.clubDetails = clubDetails || { clubName: "Unknown Club" };

    res.send(event);
  } catch (error) {
    console.error("Error fetching event details:", error);
    res.status(500).send({
      message: "Failed to fetch event details due to server error.",
    });
  }
};

/**
 * Create event payment checkout session (member only)
 */
const createEventPaymentSession = async (req, res) => {
  const { eventFee, eventId, userEmail } = req.body;
  const callingEmail = req.tokenEmail;
  const { eventsCollection, eventRegistrationsCollection } = getCollections();

  if (callingEmail !== userEmail) {
    return res
      .status(403)
      .send({ message: "Emails do not match. Unauthorized." });
  }

  if (!eventFee || !eventId) {
    return res.status(400).send({ message: "Missing fee or event ID." });
  }

  try {
    const event = await eventsCollection.findOne({
      _id: new ObjectId(eventId),
    });
    if (!event || !event.isPaid) {
      return res
        .status(404)
        .send({ message: "Event not found or is free." });
    }

    const existingRegistration =
      await eventRegistrationsCollection.findOne({
        eventId: eventId,
        userEmail: userEmail,
        status: "registered",
      });

    if (existingRegistration) {
      return res.status(400).send({
        message: "You are already registered for this event.",
      });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${event.title} Registration`,
              description: `Registration for the event: ${event.title}.`,
            },
            unit_amount: Math.round(eventFee * 100),
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      metadata: {
        eventId: eventId,
        userEmail: userEmail,
        amount: eventFee.toString(),
        type: "event",
        clubId: event.clubId,
      },
      success_url: `${process.env.CLIENT_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}&type=event`,
      cancel_url: `${process.env.CLIENT_URL}/events/${eventId}`,
    });

    res.send({ url: session.url });
  } catch (error) {
    console.error("Stripe Event Checkout Session Error:", error);
    res
      .status(500)
      .send({ message: "Failed to create payment session for event." });
  }
};

/**
 * Register for free event (member only)
 */
const registerForEvent = async (req, res) => {
  const eventId = req.params.eventId;
  const userEmail = req.tokenEmail;
  const { eventsCollection, eventRegistrationsCollection } = getCollections();

  if (!ObjectId.isValid(eventId)) {
    return res.status(400).send({ message: "Invalid Event ID." });
  }

  try {
    const event = await eventsCollection.findOne({
      _id: new ObjectId(eventId),
    });

    if (!event) {
      return res.status(404).send({ message: "Event not found." });
    }

    if (
      event.isPaid &&
      (event.eventFee > 0 ||
        event.eventFee === undefined ||
        event.eventFee === null)
    ) {
      return res.status(400).send({
        message:
          "This event requires payment. Please use the payment flow.",
      });
    }

    const existingRegistration =
      await eventRegistrationsCollection.findOne({
        eventId: eventId,
        userEmail: userEmail,
        status: "registered",
      });

    if (existingRegistration) {
      return res.status(400).send({
        message: "You are already registered for this event.",
      });
    }

    const newRegistration = {
      userEmail: userEmail,
      eventId: eventId,
      clubId: event.clubId,
      status: "registered",
      amount: 0,
      paymentStatus: "paid",
      paymentId: "FREE_REGISTRATION",
      registeredAt: new Date(),
    };
    await eventRegistrationsCollection.insertOne(newRegistration);

    res
      .status(201)
      .send({ message: "Successfully registered for the event (Free)." });
  } catch (error) {
    console.error("Event registration failed (Free):", error);
    res.status(500).send({
      message:
        "Failed to process free registration request due to server error.",
    });
  }
};

/**
 * Check event registration status (member only)
 */
const checkEventRegistrationStatus = async (req, res) => {
  const eventId = req.params.eventId;
  const userEmail = req.query.userEmail;
  const { eventRegistrationsCollection } = getCollections();

  if (!userEmail) {
    return res.status(400).send({ message: "User email is required." });
  }

  try {
    const registration = await eventRegistrationsCollection.findOne({
      eventId: eventId,
      userEmail: userEmail,
      status: "registered",
    });

    res.send({ isRegistered: !!registration });
  } catch (error) {
    console.error("Error checking event registration status:", error);
    res.status(500).send({ message: "Failed to check registration status." });
  }
};

/**
 * Get member's registered events (member only)
 */
const getMemberEvents = async (req, res) => {
  const userEmail = req.tokenEmail;
  const { eventRegistrationsCollection, eventsCollection, clubsCollection } = getCollections();

  try {
    const registrations = await eventRegistrationsCollection
      .find({ userEmail: userEmail, status: "registered" })
      .toArray();

    const eventIds = registrations.map((reg) => new ObjectId(reg.eventId));
    const events = await eventsCollection
      .find({ _id: { $in: eventIds } })
      .toArray();

    const clubIds = events.map((event) => new ObjectId(event.clubId));
    const clubs = await clubsCollection
      .find({ _id: { $in: clubIds } })
      .toArray();

    const clubMap = clubs.reduce((acc, club) => {
      acc[club._id.toString()] = club;
      return acc;
    }, {});

    const result = events.map((event) => ({
      ...event,
      clubDetails: clubMap[event.clubId] || { clubName: "Unknown Club" },
    }));

    res.send(result);
  } catch (error) {
    console.error("Error fetching member events:", error);
    res.status(500).send({ message: "Failed to fetch member events." });
  }
};

module.exports = {
  getManagerEvents,
  getEventRegistrations,
  createEvent,
  updateEvent,
  deleteEvent,
  getPublicEvents,
  getEventById,
  createEventPaymentSession,
  registerForEvent,
  checkEventRegistrationStatus,
  getMemberEvents,
};
