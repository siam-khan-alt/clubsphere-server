const logger = require("../config/logger");

let io = null;

/**
 * Set the Socket.io instance
 * @param {Object} socketIo - The Socket.io instance
 */
const setSocketIo = (socketIo) => {
  if (io) {
    logger.warn("Socket instance already set. Disconnecting old instance to prevent memory leaks.");
    io.disconnect();
  }
  io = socketIo;
};

/**
 * Get the Socket.io instance
 * @returns {Object} The Socket.io instance
 */
const getSocketIo = () => {
  return io;
};

module.exports = {
  setSocketIo,
  getSocketIo,
};
