const { ZodError } = require("zod");

/**
 * Middleware factory to validate request data using Zod schemas
 * @param {Object} schema - Zod schema object with body, params, and/or query properties
 * @returns {Function} Express middleware function
 */
const validateRequest = (schema) => {
  return (req, res, next) => {
    try {
      // Validate request body if schema.body is provided
      if (schema.body) {
        req.body = schema.body.parse(req.body);
      }

      // Validate request params if schema.params is provided
      if (schema.params) {
        req.params = schema.params.parse(req.params);
      }

      // Validate request query if schema.query is provided
      if (schema.query) {
        req.query = schema.query.parse(req.query);
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        // Format Zod validation errors
        const errors = error.errors.map((err) => ({
          field: err.path.join("."),
          message: err.message,
        }));

        return res.status(400).json({
          success: false,
          message: "Validation failed",
          errors,
        });
      }

      // Handle other errors
      return res.status(500).json({
        success: false,
        message: "Internal server error during validation",
      });
    }
  };
};

module.exports = validateRequest;
