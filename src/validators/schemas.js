const { z } = require("zod");

/**
 * User-related validation schemas
 */
const userSchemas = {
  register: z.object({
    body: z.object({
      name: z.string().min(2, "Name must be at least 2 characters"),
      email: z.string().email("Invalid email address"),
      photoURL: z.string().url("Invalid photo URL").optional(),
    }),
  }),

  googleLogin: z.object({
    body: z.object({
      name: z.string().min(2, "Name must be at least 2 characters"),
      email: z.string().email("Invalid email address"),
      photoURL: z.string().url("Invalid photo URL").optional(),
    }),
  }),

  updateUser: z.object({
    body: z.object({
      email: z.string().email("Invalid email address"),
      name: z.string().min(2, "Name must be at least 2 characters").optional(),
      photoURL: z.string().url("Invalid photo URL").optional(),
    }),
  }),

  updateRole: z.object({
    params: z.object({
      email: z.string().email("Invalid email address"),
    }),
    body: z.object({
      role: z.enum(["admin", "clubManager", "member"], {
        errorMap: () => ({ message: "Role must be admin, clubManager, or member" }),
      }),
    }),
  }),

  deleteUser: z.object({
    params: z.object({
      email: z.string().email("Invalid email address"),
    }),
  }),
};

/**
 * Club-related validation schemas
 */
const clubSchemas = {
  createClub: z.object({
    body: z.object({
      name: z.string().min(2, "Club name must be at least 2 characters"),
      description: z.string().min(10, "Description must be at least 10 characters"),
      category: z.enum(["Technology", "Photography", "Sports", "Art"], {
        errorMap: () => ({ message: "Invalid category" }),
      }),
      location: z.string().min(2, "Location must be at least 2 characters"),
      membershipFee: z.number().nonnegative("Membership fee must be non-negative"),
      bannerImage: z.string().url("Invalid banner image URL").optional(),
      meetingSchedule: z.string().optional(),
    }),
  }),

  updateClub: z.object({
    params: z.object({
      id: z.string().min(1, "Club ID is required"),
    }),
    body: z.object({
      clubName: z.string().min(2, "Club name must be at least 2 characters").optional(),
      description: z.string().min(10, "Description must be at least 10 characters").optional(),
      category: z.enum(["Technology", "Photography", "Sports", "Art"]).optional(),
      location: z.string().min(2, "Location must be at least 2 characters").optional(),
      membershipFee: z.number().nonnegative("Membership fee must be non-negative").optional(),
      bannerImage: z.string().url("Invalid banner image URL").optional(),
    }),
  }),

  updateClubStatus: z.object({
    params: z.object({
      clubId: z.string().min(1, "Club ID is required"),
    }),
    body: z.object({
      status: z.enum(["approved", "rejected"], {
        errorMap: () => ({ message: "Status must be approved or rejected" }),
      }),
    }),
  }),

  deleteClub: z.object({
    params: z.object({
      id: z.string().min(1, "Club ID is required"),
    }),
  }),

  joinClub: z.object({
    params: z.object({
      id: z.string().min(1, "Club ID is required"),
    }),
    body: z.object({
      paymentStatus: z.string().optional(),
    }),
  }),

  getClubById: z.object({
    params: z.object({
      id: z.string().min(1, "Club ID is required"),
    }),
  }),

  getClubMembers: z.object({
    params: z.object({
      clubId: z.string().min(1, "Club ID is required"),
    }),
  }),

  leaveClub: z.object({
    params: z.object({
      id: z.string().min(1, "Club ID is required"),
    }),
  }),

  addClubComment: z.object({
    params: z.object({
      id: z.string().min(1, "Club ID is required"),
    }),
    body: z.object({
      text: z.string().min(1, "Comment text is required").max(1000, "Comment must be less than 1000 characters"),
    }),
  }),

  toggleCommentReaction: z.object({
    params: z.object({
      id: z.string().min(1, "Club ID is required"),
      commentId: z.string().min(1, "Comment ID is required"),
    }),
    body: z.object({
      type: z.enum(["like", "love", "haha", "wow"], {
        errorMap: () => ({ message: "Reaction type must be like, love, haha, or wow" }),
      }),
    }),
  }),

  getClubComments: z.object({
    params: z.object({
      id: z.string().min(1, "Club ID is required"),
    }),
  }),

  editClubComment: z.object({
    params: z.object({
      id: z.string().min(1, "Club ID is required"),
      commentId: z.string().min(1, "Comment ID is required"),
    }),
    body: z.object({
      text: z.string().min(1, "Comment text is required").max(1000, "Comment must be less than 1000 characters"),
    }),
  }),

  deleteClubComment: z.object({
    params: z.object({
      id: z.string().min(1, "Club ID is required"),
      commentId: z.string().min(1, "Comment ID is required"),
    }),
  }),

  createProposal: z.object({
    params: z.object({
      id: z.string().min(1, "Club ID is required"),
    }),
    body: z.object({
      title: z.string().min(5, "Title must be at least 5 characters").max(200, "Title must be less than 200 characters"),
      description: z.string().min(10, "Description must be at least 10 characters").max(2000, "Description must be less than 2000 characters"),
      type: z.enum(["budget", "rule_change", "event", "other"], {
        errorMap: () => ({ message: "Type must be budget, rule_change, event, or other" }),
      }),
      options: z.array(z.string().min(1, "Option cannot be empty")).min(2, "At least 2 options required").max(5, "Maximum 5 options allowed"),
      durationDays: z.number().int().min(1, "Duration must be at least 1 day").max(30, "Duration cannot exceed 30 days"),
    }),
  }),

  castVote: z.object({
    params: z.object({
      id: z.string().min(1, "Club ID is required"),
      proposalId: z.string().min(1, "Proposal ID is required"),
    }),
    body: z.object({
      optionId: z.string().min(1, "Option ID is required"),
    }),
  }),

  getClubProposals: z.object({
    params: z.object({
      id: z.string().min(1, "Club ID is required"),
    }),
  }),
};

/**
 * Event-related validation schemas
 */
const eventSchemas = {
  createEvent: z.object({
    body: z.object({
      title: z.string().min(2, "Event title must be at least 2 characters"),
      description: z.string().min(10, "Description must be at least 10 characters"),
      date: z.string().refine((val) => !isNaN(Date.parse(val)), {
        message: "Invalid date format",
      }),
      location: z.string().min(2, "Location must be at least 2 characters"),
      eventFee: z.number().nonnegative("Event fee must be non-negative"),
      clubId: z.string().min(1, "Club ID is required"),
      eventImage: z.string().url("Invalid event image URL").optional(),
    }),
  }),

  updateEvent: z.object({
    params: z.object({
      id: z.string().min(1, "Event ID is required"),
    }),
    body: z.object({
      title: z.string().min(2, "Event title must be at least 2 characters").optional(),
      description: z.string().min(10, "Description must be at least 10 characters").optional(),
      date: z.string().refine((val) => !isNaN(Date.parse(val)), {
        message: "Invalid date format",
      }).optional(),
      location: z.string().min(2, "Location must be at least 2 characters").optional(),
      eventImage: z.string().url("Invalid event image URL").optional(),
    }),
  }),

  deleteEvent: z.object({
    params: z.object({
      id: z.string().min(1, "Event ID is required"),
    }),
  }),

  registerForEvent: z.object({
    params: z.object({
      eventId: z.string().min(1, "Event ID is required"),
    }),
  }),

  getEventById: z.object({
    params: z.object({
      id: z.string().min(1, "Event ID is required"),
    }),
  }),

  getEventRegistrations: z.object({
    params: z.object({
      eventId: z.string().min(1, "Event ID is required"),
    }),
  }),

  createEventPayment: z.object({
    body: z.object({
      eventFee: z.number().positive("Event fee must be positive"),
      eventId: z.string().min(1, "Event ID is required"),
      userEmail: z.string().email("Invalid email address"),
    }),
  }),
};

/**
 * Payment-related validation schemas
 */
const paymentSchemas = {
  createMembershipPayment: z.object({
    body: z.object({
      membershipFee: z.number().positive("Membership fee must be positive"),
      clubId: z.string().min(1, "Club ID is required"),
      userEmail: z.string().email("Invalid email address"),
    }),
  }),

  verifyPayment: z.object({
    query: z.object({
      session_id: z.string().min(1, "Session ID is required"),
    }),
  }),

  updateMembershipStatus: z.object({
    params: z.object({
      memberId: z.string().min(1, "Membership ID is required"),
    }),
    body: z.object({
      status: z.enum(["active", "expired"], {
        errorMap: () => ({ message: "Status must be active or expired" }),
      }),
    }),
  }),
};

/**
 * Subscription-related validation schemas
 */
const subscriptionSchemas = {
  createCheckout: z.object({
    body: z.object({
      clubId: z.string().min(1, "Club ID is required"),
      planId: z.enum(["basic", "pro", "enterprise"], {
        errorMap: () => ({ message: "Plan must be basic, pro, or enterprise" }),
      }),
    }),
  }),
};

/**
 * Referral-related validation schemas
 */
const referralSchemas = {
  trackSignup: z.object({
    body: z.object({
      referralCode: z.string().min(1, "Referral code is required"),
    }),
  }),

  allocateCredits: z.object({
    body: z.object({
      userEmail: z.string().email("Invalid email address"),
      paymentAmount: z.number().positive("Payment amount must be positive"),
    }),
  }),
};

/**
 * Chat-related validation schemas
 */
const chatSchemas = {
  createDirectRoom: z.object({
    body: z.object({
      targetEmail: z.string().email("Invalid email format"),
    }),
  }),

  sendMessage: z.object({
    body: z.object({
      roomId: z.string().min(1, "Room ID is required"),
      messageText: z.string().min(1, "Message text is required").max(5000, "Message too long"),
    }),
  }),

  getRoomMessages: z.object({
    params: z.object({
      roomId: z.string().min(1, "Room ID is required"),
    }),
  }),
};

/**
 * Notification-related validation schemas
 */
const notificationSchemas = {
  markAsRead: z.object({
    params: z.object({
      notificationId: z.string().min(1, "Notification ID is required"),
    }),
  }),

  deleteNotification: z.object({
    params: z.object({
      notificationId: z.string().min(1, "Notification ID is required"),
    }),
  }),
};

/**
 * Achievement-related validation schemas
 */
const achievementSchemas = {
  getAchievementById: z.object({
    params: z.object({
      id: z.string().min(1, "Achievement ID is required"),
    }),
  }),
};

/**
 * Query validation schemas
 */
const querySchemas = {
  search: z.object({
    query: z.object({
      search: z.string().optional(),
      category: z.string().optional(),
      sort: z.enum(["fee_asc", "fee_desc", "newest", "oldest"]).optional(),
    }),
  }),

  getUserRole: z.object({
    query: z.object({}).optional(),
  }),

  getStats: z.object({
    query: z.object({}).optional(),
  }),

  getPublicEvents: z.object({
    query: z.object({
      search: z.string().optional(),
      sort: z.string().optional(),
      order: z.enum(["asc", "desc"]).optional(),
    }),
  }),

  getAllUsers: z.object({
    query: z.object({}).optional(),
  }),

  getAdminClubs: z.object({
    query: z.object({}).optional(),
  }),

  getAdminPayments: z.object({
    query: z.object({}).optional(),
  }),
};

module.exports = {
  userSchemas,
  clubSchemas,
  eventSchemas,
  paymentSchemas,
  subscriptionSchemas,
  referralSchemas,
  chatSchemas,
  notificationSchemas,
  achievementSchemas,
  querySchemas,
};
