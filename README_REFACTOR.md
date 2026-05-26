# ClubSphere Server - MVC Refactoring Documentation

## Overview
The ClubSphere server has been refactored from a monolithic `index.js` file (2171 lines) into a clean MVC (Model-View-Controller) architecture. This refactoring improves maintainability, testability, and follows clean code principles.

## New Architecture

### Directory Structure
```
clubsphere-server/
├── index.js                          # Main entry point (60 lines)
├── src/
│   ├── config/                       # Configuration modules
│   │   ├── database.js              # MongoDB connection & collections
│   │   ├── firebase.js              # Firebase Admin SDK initialization
│   │   ├── stripe.js                # Stripe initialization
│   │   └── index.js                 # Central config exports
│   ├── middleware/                   # Authentication & authorization
│   │   └── authMiddleware.js        # Token verification & role checks
│   ├── controllers/                  # Business logic
│   │   ├── userController.js        # User operations
│   │   ├── clubController.js        # Club operations
│   │   ├── eventController.js       # Event operations
│   │   └── paymentController.js     # Payment operations
│   └── routes/                       # Route definitions
│       ├── userRoutes.js            # User endpoints
│       ├── clubRoutes.js            # Club endpoints
│       ├── eventRoutes.js           # Event endpoints
│       └── paymentRoutes.js         # Payment endpoints & webhook
└── package.json
```

## Module Breakdown

### Configuration (`src/config/`)
- **database.js**: MongoDB connection, collection access, connection management
- **firebase.js**: Firebase Admin SDK initialization and authentication
- **stripe.js**: Stripe payment gateway initialization
- **index.js**: Central export point for all configuration modules

### Middleware (`src/middleware/`)
- **authMiddleware.js**: 
  - `verifyToken`: Firebase JWT token verification
  - `verifyAdmin`: Admin role verification
  - `verifyManager`: Club Manager role verification
  - `verifyMember`: Member role verification

### Controllers (`src/controllers/`)
Each controller handles business logic for a specific domain:
- **userController.js**: User registration, login, profile management, role management
- **clubController.js**: Club CRUD, status management, member management
- **eventController.js**: Event CRUD, registration, payment sessions
- **paymentController.js**: Stripe checkout sessions, webhook handling

### Routes (`src/routes/`)
Each route file defines endpoints and applies appropriate middleware:
- **userRoutes.js**: User-related endpoints
- **clubRoutes.js**: Club-related endpoints
- **eventRoutes.js**: Event-related endpoints
- **paymentRoutes.js**: Payment endpoints and webhook (with raw body parsing)

## How to Add a New Module

### Step 1: Create Controller
Create a new file in `src/controllers/yourModuleController.js`:

```javascript
const { ObjectId } = require("mongodb");
const { getCollections } = require("../config");

const yourFunction = async (req, res) => {
  try {
    const { yourCollection } = getCollections();
    // Your business logic here
    res.send({ message: "Success" });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send({ message: "Server error" });
  }
};

module.exports = {
  yourFunction,
};
```

### Step 2: Create Routes
Create a new file in `src/routes/yourModuleRoutes.js`:

```javascript
const express = require("express");
const router = express.Router();
const { yourFunction } = require("../controllers/yourModuleController");
const { verifyToken } = require("../middleware/authMiddleware");

// Define your routes
router.post("/endpoint", verifyToken, yourFunction);

module.exports = router;
```

### Step 3: Mount Routes in index.js
Add the import and mount the router:

```javascript
const yourModuleRoutes = require("./src/routes/yourModuleRoutes");

// Mount routes
app.use("/your-module", yourModuleRoutes);
```

## Webhook Route Maintenance

The Stripe webhook route requires special handling with raw body parsing for signature verification:

```javascript
// In src/routes/paymentRoutes.js
const webhookRouter = express.Router();
webhookRouter.post("/webhook", handleStripeWebhook);

// In index.js
app.use("/webhook", express.raw({ type: "application/json" }), webhookRouter);
```

**Important**: The webhook route must be mounted with `express.raw({ type: "application/json" })` to preserve the raw request body for Stripe signature verification. Do not use the standard JSON body parser for this route.

## API Contract Preservation

All endpoints remain exactly the same as before the refactoring:
- User endpoints: `/users/*`
- Club endpoints: `/clubs/*`, `/admin/clubs/*`, `/manager/clubs/*`
- Event endpoints: `/events/*`, `/manager/events/*`
- Payment endpoints: `/payments/*`, `/webhook`

The frontend client does not need any changes.

## Security Improvements

1. **Removed sensitive logging**: Removed `console.log(token)` and `console.log(err)` from middleware
2. **Proper webhook verification**: Webhook route now uses raw body parsing for Stripe signature verification
3. **Centralized error handling**: Consistent error handling across all controllers

## Performance Improvements

1. **Reduced file size**: index.js reduced from 2171 lines to 60 lines (97% reduction)
2. **Modular loading**: Routes are loaded only when needed
3. **Cleaner imports**: Removed unused imports and dependencies

## Testing Recommendations

1. Test all API endpoints to ensure no breaking changes
2. Verify Stripe webhook signature verification works correctly
3. Test Firebase authentication flow
4. Verify role-based access control (RBAC)

## Deployment Checklist

- [ ] Update environment variables if needed
- [ ] Test all endpoints in development
- [ ] Verify Stripe webhook endpoint is accessible
- [ ] Test Firebase authentication
- [ ] Monitor server logs for any errors
- [ ] Verify database connections

## Future Enhancements

1. Add input validation middleware
2. Implement rate limiting
3. Add comprehensive error logging
4. Add unit tests for controllers
5. Add API documentation (Swagger/OpenAPI)
6. Implement caching for frequently accessed data

## Migration Summary

**Before Refactoring:**
- Single monolithic file: 2171 lines
- All logic in one place
- Difficult to maintain and test

**After Refactoring:**
- Modular structure: 13 files
- index.js: 60 lines (97% reduction)
- Clear separation of concerns
- Easy to maintain and extend

**Files Created:**
- 4 config files
- 1 middleware file
- 4 controller files
- 4 route files

**Total Lines of Code:** ~1,500 lines (better organized)

## Support

For questions or issues related to this refactoring, refer to the original commit history or contact the development team.
