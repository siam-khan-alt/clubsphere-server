const rateLimit = require("express-rate-limit");

/**
 * Rate limiter for general API routes
 * 100 requests per 15 minutes per IP
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

/**
 * Rate limiter for authentication routes
 * Relaxed limit for portfolio/demo testing
 * 100 requests per 15 minutes per IP
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Increased from 5 to 100 for smooth portfolio testing
  message: {
    success: false,
    message: "Too many authentication attempts, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for public routes (no authentication required)
 * More lenient limit for public access
 * 200 requests per 15 minutes per IP
 */
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // Limit each IP to 200 requests per windowMs
  message: {
    success: false,
    message: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for webhook routes (Stripe webhooks)
 * Very high limit to handle legitimate webhook bursts
 * 1000 requests per 15 minutes per IP
 */
const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: {
    success: false,
    message: "Too many webhook requests, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  generalLimiter,
  authLimiter,
  publicLimiter,
  webhookLimiter,
};
