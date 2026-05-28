let io = null;

/**
 * Set the Socket.io instance
 * @param {Object} socketIo - The Socket.io instance
 */
const setSocketIo = (socketIo) => {
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
