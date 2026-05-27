const nodemailer = require("nodemailer");
const logger = require("../config/logger");

/**
 * Email service configuration and utility functions
 */
class EmailService {
  constructor() {
    this.transporter = null;
    this.fromEmail = process.env.EMAIL_FROM || "noreply@clubsphere.com";
    this.fromName = process.env.EMAIL_FROM_NAME || "ClubSphere";
  }

  /**
   * Initialize the email transporter
   */
  initialize() {
    try {
      if (process.env.EMAIL_SERVICE === "sendgrid") {
        // SendGrid configuration
        this.transporter = nodemailer.createTransport({
          host: "smtp.sendgrid.net",
          port: 587,
          secure: false,
          auth: {
            user: "apikey",
            pass: process.env.SENDGRID_API_KEY,
          },
        });
      } else if (process.env.EMAIL_SERVICE === "gmail") {
        // Gmail configuration
        this.transporter = nodemailer.createTransport({
          service: "gmail",
          auth: {
            user: process.env.GMAIL_EMAIL,
            pass: process.env.GMAIL_APP_PASSWORD,
          },
        });
      } else {
        // Default SMTP configuration
        this.transporter = nodemailer.createTransport({
          host: process.env.SMTP_HOST || "smtp.gmail.com",
          port: process.env.SMTP_PORT || 587,
          secure: process.env.SMTP_SECURE === "true",
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        });
      }

      logger.info("Email service initialized successfully");
    } catch (error) {
      logger.error("Failed to initialize email service:", error);
    }
  }

  /**
   * Send an email
   * @param {Object} options - Email options
   * @param {string} options.to - Recipient email
   * @param {string} options.subject - Email subject
   * @param {string} options.text - Plain text body
   * @param {string} options.html - HTML body
   * @returns {Promise<Object>} Send result
   */
  async sendEmail(options) {
    try {
      if (!this.transporter) {
        this.initialize();
      }

      const mailOptions = {
        from: `${this.fromName} <${this.fromEmail}>`,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      };

      const info = await this.transporter.sendMail(mailOptions);
      logger.info(`Email sent to ${options.to}: ${info.messageId}`);
      return info;
    } catch (error) {
      logger.error(`Failed to send email to ${options.to}:`, error);
      throw error;
    }
  }

  /**
   * Send welcome email
   * @param {string} email - User email
   * @param {string} name - User name
   */
  async sendWelcomeEmail(email, name) {
    const subject = "Welcome to ClubSphere!";
    const text = `Hi ${name},\n\nWelcome to ClubSphere! We're excited to have you join our community.\n\nStart exploring clubs and events to connect with like-minded people.\n\nBest regards,\nThe ClubSphere Team`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4F46E5;">Welcome to ClubSphere!</h2>
        <p>Hi ${name},</p>
        <p>Welcome to ClubSphere! We're excited to have you join our community.</p>
        <p>Start exploring clubs and events to connect with like-minded people.</p>
        <p>Best regards,<br>The ClubSphere Team</p>
      </div>
    `;

    return this.sendEmail({ to: email, subject, text, html });
  }

  /**
   * Send event registration confirmation email
   * @param {string} email - User email
   * @param {string} name - User name
   * @param {string} eventTitle - Event title
   * @param {string} eventDate - Event date
   * @param {string} eventLocation - Event location
   */
  async sendEventRegistrationEmail(email, name, eventTitle, eventDate, eventLocation) {
    const subject = `Registration Confirmed: ${eventTitle}`;
    const text = `Hi ${name},\n\nYou have successfully registered for the event "${eventTitle}".\n\nDate: ${eventDate}\nLocation: ${eventLocation}\n\nWe look forward to seeing you there!\n\nBest regards,\nThe ClubSphere Team`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4F46E5;">Registration Confirmed</h2>
        <p>Hi ${name},</p>
        <p>You have successfully registered for the event <strong>${eventTitle}</strong>.</p>
        <div style="background-color: #F3F4F6; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Date:</strong> ${eventDate}</p>
          <p><strong>Location:</strong> ${eventLocation}</p>
        </div>
        <p>We look forward to seeing you there!</p>
        <p>Best regards,<br>The ClubSphere Team</p>
      </div>
    `;

    return this.sendEmail({ to: email, subject, text, html });
  }

  /**
   * Send membership status update email
   * @param {string} email - User email
   * @param {string} name - User name
   * @param {string} clubName - Club name
   * @param {string} status - Membership status
   * @param {string} endDate - Membership end date (if applicable)
   */
  async sendMembershipStatusEmail(email, name, clubName, status, endDate = null) {
    const subject = `Membership Status Update: ${clubName}`;
    let text, html;

    if (status === "active") {
      text = `Hi ${name},\n\nYour membership for ${clubName} has been activated!\n\n${endDate ? `Your membership will expire on: ${endDate}\n` : ""}Enjoy all the benefits of being a member.\n\nBest regards,\nThe ClubSphere Team`;
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #10B981;">Membership Activated!</h2>
          <p>Hi ${name},</p>
          <p>Your membership for <strong>${clubName}</strong> has been activated!</p>
          ${endDate ? `<p>Your membership will expire on: <strong>${endDate}</strong></p>` : ""}
          <p>Enjoy all the benefits of being a member.</p>
          <p>Best regards,<br>The ClubSphere Team</p>
        </div>
      `;
    } else if (status === "expired") {
      text = `Hi ${name},\n\nYour membership for ${clubName} has expired.\n\nTo continue enjoying the benefits, please renew your membership.\n\nBest regards,\nThe ClubSphere Team`;
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #EF4444;">Membership Expired</h2>
          <p>Hi ${name},</p>
          <p>Your membership for <strong>${clubName}</strong> has expired.</p>
          <p>To continue enjoying the benefits, please renew your membership.</p>
          <p>Best regards,<br>The ClubSphere Team</p>
        </div>
      `;
    } else {
      text = `Hi ${name},\n\nYour membership status for ${clubName} has been updated to: ${status}.\n\nBest regards,\nThe ClubSphere Team`;
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">Membership Status Updated</h2>
          <p>Hi ${name},</p>
          <p>Your membership status for <strong>${clubName}</strong> has been updated to: <strong>${status}</strong>.</p>
          <p>Best regards,<br>The ClubSphere Team</p>
        </div>
      `;
    }

    return this.sendEmail({ to: email, subject, text, html });
  }

  /**
   * Send membership expiration reminder email
   * @param {string} email - User email
   * @param {string} name - User name
   * @param {string} clubName - Club name
   * @param {string} endDate - Membership end date
   */
  async sendExpirationReminderEmail(email, name, clubName, endDate) {
    const subject = `Membership Expiring Soon: ${clubName}`;
    const text = `Hi ${name},\n\nYour membership for ${clubName} will expire on ${endDate}.\n\nPlease renew your membership to continue enjoying the benefits.\n\nBest regards,\nThe ClubSphere Team`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #F59E0B;">Membership Expiring Soon</h2>
        <p>Hi ${name},</p>
        <p>Your membership for <strong>${clubName}</strong> will expire on <strong>${endDate}</strong>.</p>
        <p>Please renew your membership to continue enjoying the benefits.</p>
        <p>Best regards,<br>The ClubSphere Team</p>
      </div>
    `;

    return this.sendEmail({ to: email, subject, text, html });
  }
}

// Export singleton instance
const emailService = new EmailService();
module.exports = emailService;
