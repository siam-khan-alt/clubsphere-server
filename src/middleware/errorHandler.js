const logger = require("../config/logger");

/**
 * Global error handling middleware
 * Catches all asynchronous errors and returns consistent JSON responses
 */
const errorHandler = (err, req, res, next) => {
  // Log the error with stack trace
  logger.error({
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query,
    user: req.tokenEmail || "unauthenticated",
  });

  // Determine error status code
  let statusCode = err.statusCode || 500;

  // Handle specific error types
  if (err.name === "ValidationError") {
    statusCode = 400;
  } else if (err.name === "UnauthorizedError") {
    statusCode = 401;
  } else if (err.name === "ForbiddenError") {
    statusCode = 403;
  } else if (err.name === "NotFoundError") {
    statusCode = 404;
  }

  // Prepare error response
  const errorResponse = {
    success: false,
    message: err.message || "Internal server error",
  };

  // Add stack trace in development mode
  if (process.env.NODE_ENV === "development") {
    errorResponse.stack = err.stack;
  }

  // Add validation errors if present
  if (err.errors) {
    errorResponse.errors = err.errors;
  }

  res.status(statusCode).json(errorResponse);
};

/**
 * Async wrapper to catch errors in async route handlers
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Express middleware function
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res) => {
  logger.warn({
    message: "Route not found",
    url: req.url,
    method: req.method,
  });

  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
};

module.exports = {
  errorHandler,
  asyncHandler,
  notFoundHandler,
};
