const { createEvents } = require("ics");
const logger = require("../config/logger");

/**
 * Generate an ICS calendar file for an event
 * @param {Object} eventData - Event data
 * @param {string} eventData.title - Event title
 * @param {string} eventData.description - Event description
 * @param {string} eventData.date - Event date (ISO string)
 * @param {string} eventData.location - Event location
 * @param {string} eventData.clubName - Club name
 * @returns {Promise<Object>} ICS file data
 */
const generateEventICS = async (eventData) => {
  try {
    const { title, description, date, location, clubName } = eventData;

    // Parse the date and set start/end times
    const eventDate = new Date(date);
    const startDate = [
      eventDate.getFullYear(),
      eventDate.getMonth() + 1,
      eventDate.getDate(),
      eventDate.getHours() || 9, // Default to 9 AM if no time specified
      eventDate.getMinutes() || 0,
    ];

    // Set end time to 2 hours after start time
    const endDate = [
      eventDate.getFullYear(),
      eventDate.getMonth() + 1,
      eventDate.getDate(),
      (eventDate.getHours() || 9) + 2,
      eventDate.getMinutes() || 0,
    ];

    const event = {
      start: startDate,
      duration: { hours: 2 },
      title: `${clubName}: ${title}`,
      description: description || `Event organized by ${clubName}`,
      location: location || "TBD",
      status: "CONFIRMED",
      busyStatus: "BUSY",
      organizer: { name: clubName, email: "noreply@clubsphere.com" },
      alarms: [
        {
          action: "display",
          trigger: { minutes: 30, before: true },
          description: "Event reminder",
        },
      ],
    };

    const { error, value } = createEvents([event]);

    if (error) {
      logger.error("Error generating ICS file:", error);
      throw new Error("Failed to generate calendar file");
    }

    return {
      filename: `${title.replace(/\s+/g, "_")}.ics`,
      content: value,
    };
  } catch (error) {
    logger.error("Error in generateEventICS:", error);
    throw error;
  }
};

module.exports = {
  generateEventICS,
};
