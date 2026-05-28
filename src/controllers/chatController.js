const { ObjectId } = require("mongodb");
const { getCollections, startSession } = require("../config");
const logger = require("../config/logger");

/**
 * Get all chat rooms for the current user
 */
const getUserChatRooms = async (req, res) => {
  try {
    const userEmail = req.tokenEmail;
    const { chatRoomsCollection, clubsCollection } = getCollections();

    // Get all rooms where user is a participant
    const rooms = await chatRoomsCollection
      .find({ participants: userEmail })
      .sort({ updatedAt: -1 })
      .toArray();

    // Enrich with club names for group chats
    const enrichedRooms = await Promise.all(
      rooms.map(async (room) => {
        if (room.type === "group" && room.clubId) {
          const club = await clubsCollection.findOne(
            { _id: new ObjectId(room.clubId) },
            { projection: { clubName: 1, clubLogo: 1 } }
          );
          return {
            ...room,
            clubName: club?.clubName || room.name,
            clubLogo: club?.clubLogo || null,
          };
        }
        return room;
      })
    );

    res.send(enrichedRooms);
  } catch (error) {
    logger.error("Error getting user chat rooms:", error);
    res.status(500).send({ message: "Failed to get chat rooms." });
  }
};

/**
 * Get messages for a specific room
 */
const getRoomMessages = async (req, res) => {
  try {
    const { roomId } = req.params;
    const { messagesCollection } = getCollections();

    const messages = await messagesCollection
      .find({ roomId: roomId })
      .sort({ createdAt: 1 })
      .toArray();

    res.send(messages);
  } catch (error) {
    logger.error("Error getting room messages:", error);
    res.status(500).send({ message: "Failed to get messages." });
  }
};

/**
 * Create or get direct message room
 */
const createDirectRoom = async (req, res) => {
  try {
    const { targetEmail } = req.body;
    const userEmail = req.tokenEmail;
    const { chatRoomsCollection } = getCollections();

    // Check if direct room already exists between these two users
    const existingRoom = await chatRoomsCollection.findOne({
      type: "direct",
      participants: { $all: [userEmail, targetEmail], $size: 2 },
    });

    if (existingRoom) {
      return res.send(existingRoom);
    }

    // Create new direct room
    const newRoom = {
      type: "direct",
      participants: [userEmail, targetEmail],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await chatRoomsCollection.insertOne(newRoom);

    res.send({ ...newRoom, _id: result.insertedId });
  } catch (error) {
    logger.error("Error creating direct room:", error);
    res.status(500).send({ message: "Failed to create direct room." });
  }
};

/**
 * Create group chat room for a club
 */
const createGroupRoom = async (clubId, clubName, managerEmail) => {
  const { chatRoomsCollection } = getCollections();

  try {
    const newRoom = {
      clubId: clubId,
      name: clubName,
      type: "group",
      participants: [managerEmail],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await chatRoomsCollection.insertOne(newRoom);
    logger.info(`Created group chat room for club ${clubId}`);
    return result.insertedId;
  } catch (error) {
    logger.error("Error creating group room:", error);
    throw error;
  }
};

/**
 * Add participant to a room
 */
const addParticipantToRoom = async (roomId, userEmail) => {
  const { chatRoomsCollection } = getCollections();

  try {
    await chatRoomsCollection.updateOne(
      { _id: new ObjectId(roomId) },
      {
        $addToSet: { participants: userEmail },
        $set: { updatedAt: new Date() },
      }
    );
    logger.info(`Added ${userEmail} to room ${roomId}`);
  } catch (error) {
    logger.error("Error adding participant to room:", error);
    throw error;
  }
};

/**
 * Remove participant from a room
 */
const removeParticipantFromRoom = async (roomId, userEmail) => {
  const { chatRoomsCollection } = getCollections();

  try {
    await chatRoomsCollection.updateOne(
      { _id: new ObjectId(roomId) },
      {
        $pull: { participants: userEmail },
        $set: { updatedAt: new Date() },
      }
    );
    logger.info(`Removed ${userEmail} from room ${roomId}`);
  } catch (error) {
    logger.error("Error removing participant from room:", error);
    throw error;
  }
};

/**
 * Save message to database
 * @param {string} roomId - Room ID
 * @param {string} senderEmail - Sender email
 * @param {string} messageText - Message text
 * @param {object} session - Optional MongoDB session for transaction isolation
 */
const saveMessage = async (roomId, senderEmail, messageText, session = null) => {
  const { messagesCollection, chatRoomsCollection } = getCollections();

  try {
    const newMessage = {
      roomId: roomId,
      senderEmail: senderEmail,
      messageText: messageText,
      createdAt: new Date(),
    };

    const insertOptions = session ? { session } : {};
    const result = await messagesCollection.insertOne(newMessage, insertOptions);

    // Update room's updatedAt timestamp
    const updateOptions = session ? { session } : {};
    await chatRoomsCollection.updateOne(
      { _id: new ObjectId(roomId) },
      { $set: { updatedAt: new Date() } },
      updateOptions
    );

    return { ...newMessage, _id: result.insertedId };
  } catch (error) {
    logger.error("Error saving message:", error);
    throw error;
  }
};

module.exports = {
  getUserChatRooms,
  getRoomMessages,
  createDirectRoom,
  createGroupRoom,
  addParticipantToRoom,
  removeParticipantFromRoom,
  saveMessage,
};
