const nodemailer = require("nodemailer");
require("dotenv").config();

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT), 
    secure: process.env.SMTP_SECURE === "true", 
    auth: {
        user: process.env.EMAIL,
        pass: process.env.PASS
    }
});

/**
 * Sends an email.
 * 
 * @param {Object} [mailOptions] - Optional mail options including recipient, subject, and text/HTML.
 * @param {string} [mailOptions.from] - Sender's email address. Defaults to process.env.EMAIL.
 * @param {string} [mailOptions.to] - Recipient's email address. Required if mailOptions is provided.
 * @param {string} [mailOptions.subject] - Subject of the email. Required if mailOptions is provided.
 * @param {string} [mailOptions.text] - Plain text body of the email.
 * @param {string} [mailOptions.html] - HTML body of the email.
 * @param {Array} [mailOptions.attachments] - Attachments for the email.
 * 
 * @returns {Promise<Object>} - A promise that resolves to the result of the email send.
 * @throws {Error} - Throws an error if the email cannot be sent or if required fields are missing.
 */
const sendEmail = async (mailOptions = {}) => {
    const defaultFrom = process.env.EMAIL;
    const {
        from = defaultFrom,
        to,
        subject,
        text,
        html,
        attachments = [] // Attachments array
    } = mailOptions;

    if (!to || !subject) {
        throw new Error("Missing required fields: 'to' and 'subject' must be provided.");
    }

    try {
        const info = await transporter.sendMail({
            from,
            to,
            subject,
            text,
            html,
            attachments // Include attachments in the sendMail options
        });
        console.log("Email sent: %s", info.messageId);
        return info;
    } catch (error) {
        console.error("Error sending email: ", error);
        throw error;
    }
};

module.exports = { sendEmail };
