const crypto = require("crypto");
const model = require("../models"); // Adjust the path based on your directory structure
const { createCanvas } = require("canvas");
const QRCode = require("qrcode");
const { sendEmail } = require("../config/nodemailer");
const fs = require("fs");
const path = require("path");
const axios = require("axios"); // Using axios to fetch the image data
const { MIMEImage } = require("nodemailer/lib/mime-node");
const { log } = require("console");
const { Op, INTEGER } = require("sequelize");
const PDFDocument = require("pdfkit");
const cron = require("node-cron");
const moment = require("moment");
const mmt = require("moment-timezone");
const { Parser } = require("json2csv");
const ExcelJS = require("exceljs");

const { parse } = require("csv-parse"); // For parsing CSV files
const xlsx = require("xlsx"); // For parsing Excel files

function getRandomNumber() {
  return Math.floor(Math.random() * 5) + 3;
}

// Function to generate a unique PIN within a business
async function generateUniquePinForBusiness(pinLength, businessId) {
  let pin;
  let exists;
  const pinlength = pinLength ? pinLength : 6;

  console.log("pinlength is ", pinlength);

  do {
    // Ensure pinLength is valid
    if (pinLength <= 0) {
      throw new Error("Pin length must be greater than 0");
    }

    // Calculate the minimum and maximum values for the given pinLength
    const min = Math.pow(10, pinLength - 1); // e.g., for 6 => 100000
    const max = Math.pow(10, pinLength) - 1; // e.g., for 6 => 999999

    // Generate a random number within the range and return as a zero-padded string
    pin = crypto
      .randomInt(min, max + 1)
      .toString()
      .padStart(pinLength, "0");

    // Fetch all athlete IDs in the related groups for the given business
    const athleteIds = await model.AthleteGroup.findAll({
      where: { businessId },
      include: [
        {
          model: model.Athlete,
          through: { attributes: [] }, // Exclude join table attributes
          attributes: ['id'],
        },
      ],
    }).then((groups) =>
      groups.flatMap((group) => group.Athletes.map((athlete) => athlete.id))
    );

    console.log("Athlete IDs in groups are ", athleteIds, "Generated PIN:", pin);

    // Check if the generated PIN already exists for any of these athletes
    exists = await model.Athlete.findOne({
      where: {
        id: { [Op.in]: athleteIds },
        pin,
      },
    });

    console.log("Existing athlete with PIN is ", exists);
  } while (exists); // Repeat until a unique PIN is found

  return pin;
}


exports.getUniquePin = async (req, res) => {
  try {
    let userId;

    if (req.user.role === "superAdmin") {
      userId = req.query.userId;
    } else {
      userId = req.user.id;
    }

    const business = await model.business.findOne({
      where: { userId },
      include: [model.reporting],
    });

    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business not found.",
      });
    }

    const pinLength = business.reporting.pinLength || 6; // Default to 6 if pinLength is not defined
    const businessId = business.id;

    // Generate a unique PIN for the specified business
    const uniquePin = await generateUniquePinForBusiness(pinLength, businessId);

    return res.status(200).json({
      success: true,
      message: "Unique PIN generated successfully.",
      data: {
        pin: uniquePin,
      },
    });
  } catch (error) {
    console.error("Error generating unique PIN:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while generating a PIN.",
      error: error.message,
    });
  }
};


// helper: normalize/validate `messageShown` from the request
function parseMessageShown(raw) {
  if (raw === undefined || raw === null || raw === '') return [];
  let arr = [];

  if (Array.isArray(raw)) {
    arr = raw;
  } else {
    // Could be JSON string '["email","check-in"]', or "email,check-in"
    const s = String(raw).trim();
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) arr = parsed;
      else if (typeof parsed === 'string') arr = parsed.split(',');
    } catch {
      arr = s.split(',');
    }
  }

  // normalize & filter to allowed values
  const normalize = (v) => String(v).toLowerCase().trim()
    .replace(/check[_\s]?in/g, 'check-in'); // checkin/check_in → check-in

  const allowed = new Set(['email', 'check-in']);
  const uniq = [];
  for (const v of arr.map(normalize)) {
    if (allowed.has(v) && !uniq.includes(v)) uniq.push(v);
  }
  return uniq;
}

exports.createAthlete = async (req, res) => {
  try {
    let {
      name,
      dateOfBirth,
      description,
      active,
      athleteGroupIds,
      pin,
      email,
      message,
      messageShown, // <-- NEW: read from body
    } = req.body;

    // Coerce `active` if it comes as a string via multipart/form-data
    if (typeof active === 'string') {
      const val = active.toLowerCase();
      active = (val === 'true' || val === '1' || val === 'on' || val === 'yes');
    }

    // Parse/validate messageShown to an array ( [] | ["email"] | ["check-in"] | ["email","check-in"] )
    const messageShownArr = parseMessageShown(messageShown);

    const user = req.user;
    const userId = user.role === "superAdmin" ? req.query.userId : user.id;

    const business = await model.business.findOne({ where: { userId } });
    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business not found for the provided user.",
      });
    }

    // All groups owned by this business
    const athleteGroups = await model.AthleteGroup.findAll({
      where: { businessId: business.id },
      attributes: ["id"],
    });
    const athleteGroupIdsArray = athleteGroups.map(group => group.id);

    // Normalize incoming athleteGroupIds from FormData
    // It may be "1,2", ["1","2"], or "[1,2]"
    if (typeof athleteGroupIds === "string") {
      const s = athleteGroupIds.trim();
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) {
          athleteGroupIds = parsed.map((id) => parseInt(id, 10));
        } else {
          athleteGroupIds = s.split(",").map((id) => parseInt(id.trim(), 10));
        }
      } catch {
        athleteGroupIds = s.split(",").map((id) => parseInt(id.trim(), 10));
      }
    } else if (Array.isArray(athleteGroupIds)) {
      athleteGroupIds = athleteGroupIds.map((id) => parseInt(id, 10));
    } else {
      athleteGroupIds = [];
    }

    // Parse date
    if (dateOfBirth) {
      const parsedDate = new Date(dateOfBirth);
      if (!isNaN(parsedDate)) {
        dateOfBirth = parsedDate.toISOString().slice(0, 10);
      } else {
        console.error(`Invalid date format: ${dateOfBirth}`);
        dateOfBirth = null;
      }
    } else {
      dateOfBirth = null;
    }

    // Validate groups belong to this business
    if (athleteGroupIds.some(id => !athleteGroupIdsArray.includes(id))) {
      return res.status(404).json({
        success: false,
        message: "One or more athlete groups are not valid for this business.",
      });
    }

    // Try find existing athlete by pin scoped to the business groups
    const athlete = await model.Athlete.findOne({
      where: { pin },
      include: {
        model: model.AthleteGroup,
        where: { id: { [Op.in]: athleteGroupIdsArray } },
        required: false,
      },
    });

    const savedBusiness =
      athlete?.athleteGroups?.[0]?.businessId !== undefined &&
      business.id === athlete.athleteGroups[0].businessId;

    if (athlete && savedBusiness) {
      // UPDATE existing athlete
      if (req.file && athlete.photoPath) {
        const oldImagePath = path.join(
          __dirname,
          "../public/atheletes/",
          path.basename(athlete.photoPath)
        );
        fs.unlink(oldImagePath, err => {
          if (err) console.error("Error deleting old image:", err);
        });
      }

      const updatePayload = {
        name,
        dateOfBirth,
        email,
        description,
        message,
        active: (active !== undefined ? active : athlete.active),
        photoPath: req.file ? `/public/atheletes/${req.file.filename}` : athlete.photoPath,
      };

      // Only overwrite messageShown if the client actually sent it
      if (Object.prototype.hasOwnProperty.call(req.body, 'messageShown')) {
        updatePayload.messageShown = messageShownArr; // <-- set array
      }

      const updated = await athlete.update(updatePayload);
      await updated.setAthleteGroups(athleteGroupIds);

      return res.status(200).json({
        success: true,
        message: "Athlete updated successfully.",
        data: updated,
      });
    } else {
      // CREATE new athlete
      const newAthlete = await model.Athlete.create({
        pin,
        name,
        dateOfBirth,
        email,
        description,
        message,
        messageShown: messageShownArr, // <-- save array
        active: (active !== undefined ? active : true),
        photoPath: req.file ? `/public/atheletes/${req.file.filename}` : null,
      });

      await newAthlete.setAthleteGroups(athleteGroupIds);

      // QR + email (unchanged behaviour)
      const qrCodeResponse = await axios.get(
        `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(pin)}&size=256x256`,
        { responseType: "arraybuffer" }
      );

      const emailTemplate = await model.emailTemplate.findOne({ where: { name: "welcome_athlete" } });
      if (!emailTemplate) {
        return res.status(404).json({
          success: false,
          message: "Email template not found.",
        });
      }

      let finalHtmlContent = emailTemplate.htmlContent
        .replace(/{{athleteName}}/g, name)
        .replace(/{{dateOfBirth}}/g, dateOfBirth || "N/A")
        .replace(/{{pin}}/g, pin)
        .replace(/{{description}}/g, description || "No description provided.")
        .replace(/{{qrCodeImage}}/g, "cid:qrcodeImage");

      const subject = emailTemplate.subject.replace(/{{athleteName}}/g, name);

      const mailOptions = {
        to: email,
        subject,
        html: finalHtmlContent,
        attachments: [
          {
            filename: "qrcode.png",
            content: qrCodeResponse.data,
            contentType: "image/png",
            cid: "qrcodeImage",
          },
        ],
      };

      await sendEmail(mailOptions);

      return res.status(201).json({
        success: true,
        message: "Athlete added successfully and email sent.",
        data: newAthlete,
      });
    }
  } catch (error) {
    console.error("Error adding or updating athlete:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while processing the athlete.",
      error: error.message,
    });
  }
};


exports.sendWelcomeEmail = async (req, res) => {
  try {
    const athleteId = req.query.id;
    if (!athleteId) {
      return res.status(400).json({
        success: false,
        message: "Athlete id (id) is required in query.",
      });
    }

    // Fetch the athlete details from the database
    const athlete = await model.Athlete.findOne({ where: { id: athleteId } });
    if (!athlete) {
      return res.status(404).json({
        success: false,
        message: "Athlete not found.",
      });
    }

    const { name, dateOfBirth, pin, email, description } = athlete;

    // Generate QR Code for the athlete's pin
    const qrCodeResponse = await axios.get(
      `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(pin)}&size=256x256`,
      { responseType: "arraybuffer" }
    );

    // Fetch the email template from the database
    const emailTemplate = await model.emailTemplate.findOne({ where: { name: "welcome_athlete" } });
    if (!emailTemplate) {
      return res.status(404).json({
        success: false,
        message: "Email template not found.",
      });
    }

    // Replace placeholders in the email template with actual values
    const finalHtmlContent = emailTemplate.htmlContent
      .replace(/{{athleteName}}/g, name)
      .replace(/{{dateOfBirth}}/g, dateOfBirth || "N/A")
      .replace(/{{pin}}/g, pin)
      .replace(/{{description}}/g, description || "No description provided.")
      .replace(/{{qrCodeImage}}/g, "cid:qrcodeImage");

    const subject = emailTemplate.subject.replace(/{{athleteName}}/g, name);

    const mailOptions = {
      to: email,
      subject: subject,
      html: finalHtmlContent,
      attachments: [
        {
          filename: "qrcode.png",
          content: qrCodeResponse.data,
          contentType: "image/png",
          cid: "qrcodeImage", // Matches the cid in the HTML content
        },
      ],
    };

    await sendEmail(mailOptions);

    return res.status(200).json({
      success: true,
      message: "Welcome email sent successfully.",
    });
  } catch (error) {
    console.error("Error sending welcome email:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while sending the welcome email.",
      error: error.message,
    });
  }
};




exports.deleteAthlete = async (req, res) => {
  try {
    const { id } = req.params; // Athlete ID to be deleted
    const user = req.user; // Get the authenticated user

    // Check if the user is a superAdmin, in which case they can delete any athlete
    if (user.role === "superAdmin") {
      // Find the athlete by ID
      const athlete = await model.Athlete.findOne({ where: { id } });

      if (!athlete) {
        return res
          .status(404)
          .json({ success: false, message: "Athlete not found." });
      }

      // Delete the athlete
      await athlete.destroy();

      return res.status(200).json({
        success: true,
        message: "Athlete deleted successfully by superAdmin.",
      });
    } else {
      // Find the business associated with the regular user
      const business = await model.business.findOne({
        where: { userId: user.id },
      });

      if (!business) {
        return res.status(404).json({
          success: false,
          message: "Business not found for the user.",
        });
      }

      // Find the athlete by ID and ensure it's associated with the user's business
      const athlete = await model.Athlete.findOne({
        where: { id },
      });

      if (!athlete) {
        return res.status(404).json({
          success: false,
          message: "Athlete not found or not associated with this business.",
        });
      }

      // Delete the athlete
      await athlete.destroy();

      return res.status(200).json({
        success: true,
        message: "Athlete deleted successfully.",
      });
    }
  } catch (error) {
    console.error("Error deleting athlete:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while deleting the athlete.",
      error: error.message,
    });
  }
};



exports.checkInByPin = async (req, res) => {
  try {
    const { pin, businessId } = req.body; // Get the pin from the request body
    console.log("businessId", businessId);

    // Fetch the business details, including the timezone
    const business = await model.business.findByPk(businessId);
    console.log("business is ", business);

    if (!business) {
      return res
        .status(404)
        .json({ success: false, message: "Business not found." });
    }

    const businessTimezone = business.timezone || "UTC"; // Default to UTC if no timezone is set
    console.log("Business timezone: ", businessTimezone);

    // Step 1: Get AthleteGroup IDs related to the business
    const athleteGroups = await model.AthleteGroup.findAll({
      where: { businessId },
      attributes: ["id"], // Fetch only the AthleteGroup IDs
    });

    if (!athleteGroups.length) {
      return res.status(404).json({
        success: false,
        message: "No athlete groups found for the business.",
      });
    }

    // Extract AthleteGroup IDs
    const athleteGroupIds = athleteGroups.map((group) => group.id);

    // Step 2: Check if an athlete with the given pin exists in any of the athlete groups related to the business
    const athlete = await model.Athlete.findOne({
      include: {
        model: model.AthleteGroup,
        through: { attributes: [] }, // Exclude the join table attributes
        where: {
          id: { [Op.in]: athleteGroupIds }, // Match against the list of AthleteGroup IDs
        },
      },
      where: { pin }, // Match the pin
    });

    if (!athlete) {
      return res
        .status(404)
        .json({ success: false, message: "Athlete not found." });
    }

    // Step 3: Get the current date and time in the business's timezone
    const currentDate = mmt().tz(businessTimezone);
    const checkinDate = currentDate.format("YYYY-MM-DD"); // Format as YYYY-MM-DD
    const checkinTime = currentDate.format("HH:mm:ss"); // Format as HH:MM:SS

    console.log("Check-in date and time: ", checkinDate, checkinTime);

    // Step 4: Create a new check-in record
    const checkIn = await model.checkin.create({
      athleteId: athlete.id, // Associate check-in with the athlete
      checkinDate,
      checkinTime,
    });

    // Step 5: Fetch the email template and send the email (if available)
    const emailTemplate = await model.emailTemplate.findOne({
      where: { name: "check_in_notification" },
    });
    const messageShown=athlete.messageShown? JSON.parse(athlete.messageShown):[]

    if (emailTemplate && athlete.email && messageShown.includes('email')) {
      try {
        // Replace placeholders with actual values
        const emailContent = emailTemplate.htmlContent
          .replace(/{{athleteName}}/g, athlete.name)
          .replace(/{{checkinDate}}/g, checkinDate)
          .replace(/{{checkinTime}}/g, checkinTime)
          .replace(/{{businessName}}/g, business.name);
        const subject = emailTemplate.subject.replace(
          /{{athleteName}}/g,
          athlete.name
        );
        // Prepare email options
        const emailOptions = {
          to: athlete.email,
          subject: subject,
          html: emailContent,
        };
        await sendEmail(emailOptions);
      } catch (emailError) {
        // Log the email sending error but do not fail the check-in
        console.error("Error sending email:", emailError);
      }
    }
    const message=messageShown.includes("check-in")? athlete?.message : ""
    // Return success with HTTP 200 regardless of the email result
    return res.status(200).json({
      success: true,
      message: "Athlete checked in successfully.",
      data: {
        checkinDate: checkIn.checkinDate,
        checkinTime: checkIn.checkinTime,
        athleteName: athlete.name,
        athleteMessage: message,
        messageShown: messageShown,
        photoPath: athlete.photoPath,
        businessId: businessId,
      },
    });
  } catch (error) {
    console.error("Error checking in athlete:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while checking in the athlete.",
      error: error.message,
    });
  }
};



exports.getAllAthletes = async (req, res) => {
  try {
    const user = req.user;
    const userId = user.role === "superAdmin" ? req.query.userId : user.id;
    const {
      page = 1,
      limit = 10,
      query: qry,
    } = req.query;

    const parsedPage = parseInt(page, 10);
    const parsedLimit = parseInt(limit, 10);

    // Find the business associated with the userId
    const business = await model.business.findOne({ where: { userId } });
    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business not found for the provided user.",
      });
    }

    console.log("Query is:", qry);

    let mergedAthleteArray = [];

    if (qry) {
      // Fetch athletes matching the query for each field separately
      const [athletesByName, athletesById, athletesByGroup] = await Promise.all([
        model.Athlete.findAll({
          where: { name: { [Op.like]: `%${qry}%` } },
          include: [
            {
              model: model.AthleteGroup,
              where: { businessId: business.id },
              attributes: ["groupName"],
              through: { attributes: [] },
            },
          ],
        }),
        model.Athlete.findAll({
          where: { pin: qry },
          include: [
            {
              model: model.AthleteGroup,
              where: { businessId: business.id },
              attributes: ["groupName"],
              through: { attributes: [] },
            },
          ],
        }),
        model.Athlete.findAll({
          include: [
            {
              model: model.AthleteGroup,
              where: {
                businessId: business.id,
                groupName: { [Op.like]: `%${qry}%` },
              },
              attributes: ["groupName"],
              through: { attributes: [] },
            },
          ],
        }),
      ]);

      // Merge results without duplicates
      const mergedAthletes = new Map();
      [...athletesByName, ...athletesById, ...athletesByGroup].forEach((athlete) => {
        mergedAthletes.set(athlete.id, {
          ...athlete.dataValues,
          groupName: athlete.athleteGroups
            .map((group) => group.groupName)
            .join(", "),
        });
      });

      mergedAthleteArray = Array.from(mergedAthletes.values());
    } else {
      // If no query is provided, fetch all athletes
      const allAthletes = await model.Athlete.findAll({
        include: [
          {
            model: model.AthleteGroup,
            where: { businessId: business.id },
            attributes: ["groupName"],
            through: { attributes: [] },
          },
        ],
      });

      mergedAthleteArray = allAthletes.map((athlete) => ({
        ...athlete.dataValues,
        groupName: athlete.athleteGroups
          .map((group) => group.groupName)
          .join(", "),
      }));
    }

    // Pagination logic
    const totalItems = mergedAthleteArray.length;
    const totalPages = Math.ceil(totalItems / parsedLimit);

    if (parsedPage > totalPages || parsedPage < 1) {
      return res.status(200).json({
        success: true,
        message: "Page out of range.",
        data: {
          totalItems,
          totalPages,
          currentPage: parsedPage,
          athletes: [],
        },
      });
    }

    const offset = (parsedPage - 1) * parsedLimit;
    const paginatedAthletes = mergedAthleteArray.slice(offset, offset + parsedLimit);

    // Prepare the response
    return res.status(200).json({
      success: true,
      message: "Athletes retrieved successfully.",
      data: {
        totalItems,
        totalPages,
        currentPage: parsedPage,
        athletes: paginatedAthletes,
      },
    });
  } catch (error) {
    console.error("Error retrieving athletes:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while retrieving athletes.",
      error: error.message,
    });
  }
};


exports.getAthleteCheckins = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      query,
      startDate,
      endDate,
    } = req.query;
    const offset = (page - 1) * limit;

    // Determine userId based on role
    const user = req.user;
    const userId = user.role === "superAdmin" ? req.query.userId : user.id;

    // Fetch business for the user
    const business = await model.business.findOne({ where: { userId } });
    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business not found for the provided user.",
      });
    }

    // Find all athlete groups associated with the business
    const athleteGroups = await model.AthleteGroup.findAll({
      where: { businessId: business.id },
      attributes: ["id"],
    });

    if (!athleteGroups || athleteGroups.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No athlete groups found for this business.",
      });
    }

    // Extract athlete group IDs
    const athleteGroupIds = athleteGroups.map((group) => group.id);

    // Construct search condition for athletes
    let searchCondition = {};
    if (query) {
      searchCondition = {
        [Op.or]: [
          { name: { [Op.like]: `%${query}%` } },
          { pin: query }
        ]
      };
    }
    // Use athlete group names to filter athletes if provided

    const athleteGroupSearchCondition = query
      ? { groupName: { [Op.like]: `%${query}%` } }
      : {};



    // Construct date range condition for check-ins
    const dateCondition = {};
    if (startDate && endDate) {
      dateCondition.checkinDate = {
        [Op.between]: [new Date(startDate), new Date(endDate)],
      };
    } else if (startDate) {
      dateCondition.checkinDate = { [Op.gte]: new Date(startDate) };
    } else if (endDate) {
      dateCondition.checkinDate = { [Op.lte]: new Date(endDate) };
    }

    // Fetch check-ins for the athletes, ensuring they belong to the business's groups
    let { count, rows: checkins } = await model.checkin.findAndCountAll({
      where: { ...dateCondition },
      include: [
        {
          model: model.Athlete,
          attributes: ["id", "pin", "name", "photoPath"],
          where: searchCondition,
          include: [
            {
              model: model.AthleteGroup,
              attributes: ["groupName", "businessId"],
              where: {
                businessId: business.id,
                id: { [Op.in]: athleteGroupIds },
              },
              through: { attributes: [] },
            },
          ],
        },
      ],
      distinct: true, // Ensure deduplication for count
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });

    // If no check-ins found, perform a second query with modified conditions
    if (count < 1) {
      const { count: newCount, rows: newCheckins } = await model.checkin.findAndCountAll({
        where: { ...dateCondition },
        include: [
          {
            model: model.Athlete,
            attributes: ["id", "pin", "name", "photoPath"],
            where: {}, // You can leave it empty or modify it based on the requirements
            include: [
              {
                model: model.AthleteGroup,
                attributes: ["groupName", "businessId"],
                where: {
                  businessId: business.id,
                  id: { [Op.in]: athleteGroupIds },
                  ...athleteGroupSearchCondition, // Apply additional search condition
                },
                through: { attributes: [] },
              },
            ],
          },
        ],
        distinct: true, // Ensure deduplication for count
        limit: parseInt(limit, 10),
        offset: parseInt(offset, 10),
      });

      // Update the initial variables if the second query returns results
      count = newCount;
      checkins = newCheckins;
    }

    console.log("count is ", count, checkins.length);


    // Transform data to include groupNames as an array for each athlete
    const checkinData = checkins.map((checkin) => {
  const athlete = checkin.Athlete;
  const groupNames = athlete.athleteGroups.map((group) => group.groupName).join(", ");

  // Convert checkinTime to AM/PM format
  const formattedTime = new Date(`1970-01-01T${checkin.checkinTime}Z`).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
    timeZone: 'UTC'
  });

  return {
    id: checkin.id,
    createdAt: checkin.checkinDate,
    checkinTime: formattedTime,
    athlete: {
      pin: athlete.pin,
      name: athlete.name,
      photoPath: athlete.photoPath || null,
      groupNames,
    },
  };
});


    console.log("checkinData is ", checkinData.length);


    return res.status(200).json({
      success: true,
      message: "Active athlete check-ins retrieved successfully.",
      data: checkinData,
      currentPage: parseInt(page, 10),
      totalPages: Math.ceil(count / limit),
      totalCheckins: count,
    });
  } catch (error) {
    console.error("Error fetching active athlete check-ins:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while fetching active athlete check-ins.",
      error: error.message,
    });
  }
};

exports.exportCheckins = async (req, res) => {
  try {
    const { query, startDate, endDate, format } = req.query;
    const user = req.user;
    const userId = user.role === "superAdmin" ? req.query.userId : user.id;

    // Fetch the associated business
    const business = await model.business.findOne({ where: { userId } });
    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business not found for the provided user.",
      });
    }

    // Get athlete groups associated with the business
    const athleteGroups = await model.AthleteGroup.findAll({
      where: { businessId: business.id },
    });
    if (!athleteGroups.length) {
      return res.status(404).json({
        success: false,
        message: "No athlete groups found for this business.",
      });
    }

    // Date condition for filtering check-ins
    const dateCondition = {};
    if (startDate && endDate) {
      dateCondition.checkinDate = {
        [Op.between]: [new Date(startDate), new Date(endDate)],
      };
    } else if (startDate) {
      dateCondition.checkinDate = { [Op.gte]: new Date(startDate) };
    } else if (endDate) {
      dateCondition.checkinDate = { [Op.lte]: new Date(endDate) };
    }

    // Build search conditions for filtering athletes
    let searchCondition = { active: true };
    let searchGroup = { businessId: business.id };
    let isGroup = null;
    // Include athlete group filtering if groupName is provided
    if (query) {
      const athleteGroupIds = await model.AthleteGroup.findAll({
        where: { groupName: { [Op.like]: `%${query}%` } },
        attributes: ["id"],
      }).then((groups) => groups.map((group) => group.id));
      if (athleteGroupIds.length > 0) {
        searchGroup.id = athleteGroupIds[0];
        isGroup = athleteGroupIds[0];
      }
    }
    // Fetch active athletes in the groups linked to the business
    const athleteIds = await model.Athlete.findAll({
      where: searchCondition,
      include: [
        {
          model: model.AthleteGroup,
          where: searchGroup, // Ensure athletes are linked to this business
          attributes: [], // Don't need group details here
          through: { attributes: [] }, // Ignore junction table attributes
        },
      ],
      attributes: ["id"],
    }).then((athletes) => athletes.map((athlete) => athlete.id));

    if (athleteIds.length === 0) {
      return res.status(404).json({
        success: false,
        message:
          "No active athletes found in the associated athlete groups.",
      });
    }

    // Further filtering by athleteName and pin if provided
    if (query && !isGroup) {
      searchCondition = {
        [Op.or]: [
          { name: { [Op.like]: `%${query}%` } },
          { pin: query },
        ],
      };
    }

    // Fetch check-ins for the filtered athletes
    const checkins = await model.checkin.findAll({
      where: { athleteId: athleteIds, ...dateCondition },
      include: [
        {
          model: model.Athlete,
          attributes: ["id", "pin", "name"],
          where: searchCondition,
          include: [
            {
              model: model.AthleteGroup,
              attributes: ["groupName"],
              through: { attributes: [] },
            },
          ],
        },
      ],
    });

    if (checkins.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No check-ins found for the given criteria.",
      });
    }

    // Prepare data in tabular form with required columns
    const data = checkins.map((checkin, index) => {
      const athlete = checkin.Athlete;
      const checkinDate = new Date(checkin.checkinDate).toLocaleDateString();
      const checkinTime = checkin.checkinTime;
      const groupNames = athlete.athleteGroups
        .map((group) => group.groupName)
        .join(", ");
      return {
        "S.No": index + 1,
        "Athlete Name": athlete.name,
        "Athlete Id": athlete.pin,
        "Group Names": groupNames,
        "Check-in Date": checkinDate,
        "Check-in Time": checkinTime,
      };
    });

    // Export as CSV (plain text)
    if (format === "csv") {
      const fields = [
        "S.No",
        "Athlete Name",
        "Athlete Id",
        "Group Names",
        "Check-in Date",
        "Check-in Time",
      ];
      const parser = new Parser({ fields });
      const csv = parser.parse(data);
      res.setHeader(
        "Content-disposition",
        `attachment; filename=athlete_checkins_${Date.now()}.csv`
      );
      res.setHeader("Content-type", "text/csv");
      return res.send(csv);
    }

    // Export as Excel with styled header row
    if (format === "excel") {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Athlete Check-ins");
      
      // Define columns
      worksheet.columns = [
        { header: "S.No", key: "S.No", width: 10 },
        { header: "Athlete Name", key: "Athlete Name", width: 20 },
        { header: "Athlete Id", key: "Athlete Id", width: 15 },
        { header: "Group Names", key: "Group Names", width: 30 },
        { header: "Check-in Date", key: "Check-in Date", width: 15 },
        { header: "Check-in Time", key: "Check-in Time", width: 15 },
      ];
      
      // Style header row: bold text and a very light green background
      worksheet.getRow(1).eachCell((cell) => {
        cell.font = { bold: true };
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFD0F0C0" },
        };
      });
      
      // Add data rows
      worksheet.addRows(data);
      
      res.setHeader(
        "Content-disposition",
        `attachment; filename=athlete_checkins_${Date.now()}.xlsx`
      );
      res.setHeader(
        "Content-type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      await workbook.xlsx.write(res);
      return res.end();
    }
    
    // Default: Export as PDF with table pagination
    const doc = new PDFDocument();
    const filename = `athlete_checkins_${Date.now()}.pdf`;
    res.setHeader("Content-disposition", `attachment; filename=${filename}`);
    res.setHeader("Content-type", "application/pdf");
    doc.pipe(res);

    // Title
    doc.fontSize(20).text("Athlete Check-ins", { align: "center" });
    doc.moveDown();

    // Table headers and columns configuration
    const tableHeaders = [
      "S.No",
      "Athlete Name",
      "Athlete Id",
      "Group Names",
      "Check-in Date",
      "Check-in Time",
    ];
    const columnWidths = [40, 120, 80, 160, 100, 100];
    const startX = 7;
    let currentY = doc.y;
    const headerHeight = 30; // increased header height for PDF

    // Function to check if a new page is needed and re-draw header
    function checkAndAddPage(rowHeight) {
      if (currentY + rowHeight > doc.page.height - doc.page.margins.bottom) {
        doc.addPage();
        currentY = doc.y;
        // Re-draw header on new page
        tableHeaders.forEach((header, i) => {
          const x = startX + columnWidths.slice(0, i).reduce((a, b) => a + b, 0);
          doc
            .rect(x, currentY, columnWidths[i], headerHeight)
            .fillAndStroke("#d0f0c0", "black")
            .lineWidth(1)
            .stroke();
          doc
            .font("Helvetica-Bold")
            .fontSize(12)
            .fillColor("black")
            .text(header, x + 5, currentY + 10, {
              width: columnWidths[i] - 10,
              align: "center",
            });
        });
        currentY += headerHeight;
      }
    }

    // Draw header on first page
    tableHeaders.forEach((header, i) => {
      const x = startX + columnWidths.slice(0, i).reduce((a, b) => a + b, 0);
      doc
        .rect(x, currentY, columnWidths[i], headerHeight)
        .fillAndStroke("#d0f0c0", "black")
        .lineWidth(1)
        .stroke();
      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor("black")
        .text(header, x + 5, currentY + 10, {
          width: columnWidths[i] - 10,
          align: "center",
        });
    });
    currentY += headerHeight;

    // Draw table rows with pagination check
    data.forEach((row) => {
      // Check if new page is needed before drawing the row (row height is 20)
      checkAndAddPage(20);
      const rowData = [
        row["S.No"],
        row["Athlete Name"],
        row["Athlete Id"],
        row["Group Names"],
        row["Check-in Date"],
        row["Check-in Time"],
      ];
      rowData.forEach((cell, i) => {
        const x = startX + columnWidths.slice(0, i).reduce((a, b) => a + b, 0);
        doc
          .rect(x, currentY, columnWidths[i], 20)
          .strokeColor("black")
          .lineWidth(1)
          .stroke();
        doc
          .font("Helvetica")
          .fontSize(10)
          .text(cell, x + 5, currentY + 5, {
            width: columnWidths[i] - 10,
            align: "center",
          });
      });
      currentY += 20;
    });

    doc.end();
  } catch (error) {
    console.error("Error fetching active athlete check-ins:", error);
    return res.status(500).json({
      success: false,
      message:
        "An error occurred while fetching active athlete check-ins.",
      error: error.message,
    });
  }
};




async function sendCheckinPdfEmail(user, business) {
  try {
    // Fetch Athlete Groups for the Business
    const athleteGroups = await model.AthleteGroup.findAll({
      where: { businessId: business.id },
    });

    if (!athleteGroups || athleteGroups.length === 0) {
      console.log(`No athlete groups found for business ${business.id}`);
      return;
    }

    // Fetch active Athletes in the found Athlete Groups
    const athleteIds = await model.Athlete.findAll({
      where: {
        athleteGroupId: athleteGroups.map((group) => group.id),
        active: true,
      },
      attributes: ["id", "name", "pin", "athleteGroupId"],
    }).then((athletes) => athletes.map((athlete) => athlete.id));

    if (athleteIds.length === 0) {
      console.log(
        `No active athletes found in groups for business ${business.id}`
      );
      return;
    }

    // Fetch Check-in data for these Athletes
    const checkins = await model.checkin.findAll({
      where: { athleteId: athleteIds },
      include: [
        {
          model: model.Athlete,
          attributes: ["id", "pin", "name"],
          include: [
            {
              model: model.AthleteGroup,
              attributes: ["groupName"],
            },
          ],
        },
      ],
    });

    if (checkins.length === 0) {
      console.log(`No check-ins found for athletes in business ${business.id}`);
      return;
    }

    // Generate PDF
    const doc = new PDFDocument();
    const filename = `athlete_checkins_${Date.now()}.pdf`;

    // Create PDF content
    doc.fontSize(20).text("Athlete Check-ins", { align: "center" });
    doc.moveDown();

    // Table headers and columns with borders
    const headers = [
      "S.No",
      "Athlete Name",
      "Athlete Id",
      "Group Name",
      "Check-in Date",
      "Check-in Time",
    ];
    const columnWidths = [50, 150, 100, 100, 100, 100];
    const startX = 7;
    let currentY = doc.y;

    // Draw headers with background color and bold text
    headers.forEach((header, i) => {
      doc
        .rect(
          startX + columnWidths.slice(0, i).reduce((a, b) => a + b, 0),
          currentY,
          columnWidths[i],
          20
        )
        .fillAndStroke("#d0f0c0", "black")
        .lineWidth(1)
        .stroke();

      doc
        .font("Helvetica-Bold")
        .fontSize(12)
        .fillColor("black")
        .text(
          header,
          startX + columnWidths.slice(0, i).reduce((a, b) => a + b, 0) + 5,
          currentY + 5,
          {
            width: columnWidths[i] - 10,
            align: "center",
          }
        );
    });
    currentY += 20;

    // Draw table rows with borders
    checkins.forEach((checkin, index) => {
      const athlete = checkin.Athlete;
      const groupName = athlete.athleteGroup.groupName || "N/A";
      const checkinDate = new Date(checkin.checkinDate).toLocaleDateString();
      const checkinTime = checkin.checkinTime;

      const row = [
        index + 1,
        athlete.name,
        athlete.pin,
        groupName,
        checkinDate,
        checkinTime,
      ];

      row.forEach((data, i) => {
        doc
          .rect(
            startX + columnWidths.slice(0, i).reduce((a, b) => a + b, 0),
            currentY,
            columnWidths[i],
            20
          )
          .strokeColor("black")
          .lineWidth(1)
          .stroke()
          .font("Helvetica")
          .fontSize(10)
          .text(
            data,
            startX + columnWidths.slice(0, i).reduce((a, b) => a + b, 0) + 5,
            currentY + 5,
            {
              width: columnWidths[i] - 10,
              align: "center",
            }
          );
      });
      currentY += 20;
    });

    // Finalize PDF and send as email
    const buffers = [];
    doc.on("data", buffers.push.bind(buffers));
    doc.on("end", async () => {
      const pdfData = Buffer.concat(buffers);

      // Send email with PDF attachment using the sendEmail function
      const mailOptions = {
        from: process.env.EMAIL, // Ensure this environment variable is set
        to: user.email,
        subject: `Check-in Report for ${business.name}`,
        text: "Please find the attached check-in report.",
        attachments: [
          {
            filename,
            content: pdfData,
            contentType: "application/pdf",
          },
        ],
      };

      try {
        await sendEmail(mailOptions); // Call the sendEmail function
        console.log(`Email sent to ${user.email}`);
      } catch (error) {
        console.error("Failed to send email:", error);
      }
    });

    doc.end();
  } catch (error) {
    console.error("Error generating check-in PDF:", error);
  }
}

// Main function to handle athlete processing from CSV or Excel file
exports.bulkUploadAthletes = async (req, res) => {
  try {
    const file = req.file; // File provided by Multer middleware
    if (!file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded." });
    }

    let athletesData = [];
    const { athleteGroupIds } = req.body; // Get athleteGroupIds array from the request body

    // Step 1: Parse the file
    if (file.mimetype === "text/csv") {
      athletesData = parse(file.buffer.toString(), {
        columns: true,
        skip_empty_lines: true,
      });
    } else if (
      file.mimetype ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      file.mimetype === "application/vnd.ms-excel"
    ) {
      const workbook = xlsx.read(file.buffer, { type: "buffer" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      athletesData = xlsx.utils.sheet_to_json(sheet);
    } else {
      return res
        .status(400)
        .json({ success: false, message: "Invalid file type." });
    }

    // Step 2: Fetch the business
    const user = req.user;
    const userId = user.role === "superAdmin" ? req.query.userId : user.id;
    const business = await model.business.findOne({
      where: { userId },
      include: [model.reporting],
    });

    if (!business) {
      return res
        .status(404)
        .json({ success: false, message: "Business not found." });
    }

    // Fetch all athlete groups based on athleteGroupIds
    const athleteGroups = await model.AthleteGroup.findAll({
      where: { id: athleteGroupIds, businessId: business.id },
    });

    // Ensure all provided groups exist
    if (athleteGroups.length !== athleteGroupIds.length) {
      return res.status(404).json({
        success: false,
        message: "One or more athlete groups not found.",
      });
    }

    // Step 3: Process athletes data
    const processedAthletes = [];
    for (const row of athletesData) {
      let {
        pin,
        name,
        description,
        dateOfBirth,
        athleteGroupClass,
        athleteGroupName,
        message,
        email,
      } = row;

      // Parse dateOfBirth if present
      if (dateOfBirth) {
        const parsedDate = new Date(dateOfBirth);
        if (!isNaN(parsedDate)) {
          dateOfBirth = parsedDate.toISOString().slice(0, 10);
        } else {
          console.error(`Invalid date format for row: ${JSON.stringify(row)}`);
          dateOfBirth = null; // Set to null if invalid date
        }
      } else {
        dateOfBirth = null; // Set to null if undefined or missing
      }

      // Generate PIN if not provided
      if (!pin) {
        pin = await generateUniquePinForBusiness(
          business.reporting.pinLength,
          business.id
        );
      }

      // Check for existing athlete
      const existingAthlete = await model.Athlete.findOne({
        where: { pin },
      });

      if (existingAthlete) {
        // Update existing athlete and associate with all athlete groups
        await existingAthlete.update({
          name,
          dateOfBirth,
          description,
          email,
          message,
        });
        await existingAthlete.setAthleteGroups(athleteGroups); // Add athlete to multiple groups
      } else {
        // Create new athlete
        const newAthlete = await model.Athlete.create({
          pin,
          name,
          dateOfBirth,
          description,
          email,
          message
        });

        // Add the athlete to the provided athlete groups
        await newAthlete.setAthleteGroups(athleteGroups);

        processedAthletes.push({ pin, name, email });
      }
    }

    // Send immediate response
    res.status(200).json({
      success: true,
      message: "Athletes uploaded and processed successfully.",
      data: processedAthletes,
    });

    // Step 4: Send emails in batches
    const batchSize = 10; // Number of emails to send per batch
    const delayBetweenBatches = 30 * 60 * 1000; // 30 minutes in milliseconds

    const sendEmailBatch = async (batch) => {
      try {
        for (const { pin, name, email } of batch) {
          if (!email) continue; // Skip if no email

          // Fetch QR code
          const qrCodeResponse = await axios.get(
            `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
              pin
            )}&size=256x256`,
            { responseType: "arraybuffer" }
          );

          // Prepare email content
          const finalHtmlContent = `
            <html>
              <body style="font-family: Arial, sans-serif; line-height: 1.5;">
                <h1>Welcome ${name}!</h1>
                <p>Your unique PIN is: <strong>${pin}</strong></p>
                <p>Scan the QR code below to access your profile:</p>
                <img src="cid:qrcodeImage" alt="QR Code" style="width: 200px; height: 200px;"/>
              </body>
            </html>
          `;

          const mailOptions = {
            to: email,
            subject: "Welcome to Our Athletic Program!",
            html: finalHtmlContent,
            attachments: [
              {
                filename: "qrcode.png",
                content: qrCodeResponse.data,
                contentType: "image/png",
                cid: "qrcodeImage",
              },
            ],
          };

          // Send email
          await sendEmail(mailOptions);
        }
      } catch (err) {
        console.error("Error sending batch emails:", err);
      }
    };

    const batches = [];
    for (let i = 0; i < processedAthletes.length; i += batchSize) {
      batches.push(processedAthletes.slice(i, i + batchSize));
    }

    for (const batch of batches) {
      await sendEmailBatch(batch);
      console.log(`Waiting for ${delayBetweenBatches / 60000} minutes before the next batch.`);
      await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
    }

    console.log("All emails have been sent.");
  } catch (error) {
    console.error("Error processing athletes upload:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while processing the athletes.",
      error: error.message,
    });
  }
};

exports.checkPin = async (req, res) => {
  try {
    const user = req.user;
    let { pin, userId } = req.query;

    // Use the logged-in user's ID if they're not a superAdmin
    if (user.role !== "superAdmin") {
      userId = user.id;
    }

    // Step 1: Find the business associated with the user ID
    const business = await model.business.findOne({
      where: { userId },
      attributes: ["id"], // Fetch only the business ID
    });

    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business not found.",
      });
    }

    // Step 2: Find the AthleteGroups related to the business
    const athleteGroups = await model.AthleteGroup.findAll({
      where: { businessId: business.id },
      attributes: ["id"], // Fetch only the AthleteGroup IDs
    });

    if (!athleteGroups.length) {
      return res.status(404).json({
        success: false,
        message: "No athlete groups found for the business.",
      });
    }

    // Extract AthleteGroup IDs
    const athleteGroupIds = athleteGroups.map((group) => group.id);

    // Step 3: Check if any athlete exists with the given pin in the athlete groups
    const athlete = await model.Athlete.findOne({
      include: {
        model: model.AthleteGroup,
        through: { attributes: [] }, // Exclude join table attributes
        where: {
          id: { [Op.in]: athleteGroupIds }, // Match against the list of AthleteGroup IDs
        },
      },
      where: { pin }, // Match the pin
    });

    if (!athlete) {
      return res.status(200).json({
        success: true,
        message: "It is a valid pin.",
      });
    }

    // If an athlete is found with the pin in one of the groups
    return res.status(200).json({
      success: false,
      message: "Pin already exists for the business.",
    });
  } catch (error) {
    console.error("Error checking pin:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while checking the pin.",
    });
  }
};





const scheduler = cron.schedule("0 0 * * *", async () => {
  try {
    console.log("Running scheduled job...");

    // Fetch all users with the relevant roles
    const users = await model.user.findAll({
      where: { role: { [Op.in]: ["admin"] } },
    });

    for (const user of users) {
      // For each user, find their associated business
      const business = await model.business.findOne({
        where: { userId: user.id },
      });

      if (!business) {
        console.log(`No business found for user ${user.id}`);
        continue;
      }

      // Find the reporting settings for the business
      const reporting = await model.reporting.findOne({
        where: { businessId: business.id },
      });

      if (!reporting) {
        console.log(`No reporting found for business ${business.id}`);
        continue;
      }

      // Calculate if the report is due
      const businessCreatedAt = moment(business.createdAt); // Business creation date
      const currentDate = moment(); // Current date

      let durationToCheck;
      if (reporting.duration === "weekly") {
        // Check if 7 days have passed since the last email was sent or business was created
        durationToCheck = 7;
      } else if (reporting.duration === "monthly") {
        // Check if 30 days have passed since the last email was sent or business was created
        durationToCheck = 30;
      } else {
        console.log(`Unknown reporting duration for business ${business.id}`);
        continue; // Skip if duration is unknown
      }

      // Calculate the difference between the current date and the business creation date
      const daysSinceCreation = currentDate.diff(businessCreatedAt, "days");
      console.log(
        "User ID:",
        user.id,
        "Days since creation:",
        daysSinceCreation
      );

      // If the number of days since creation is greater than or equal to the duration,
      // and the difference is divisible by the duration, send the report
      if (
        daysSinceCreation >= durationToCheck &&
        daysSinceCreation % durationToCheck === 0
      ) {
        console.log(
          `Sending report to user ${user.email} for business ${business.id}`
        );

        // Call the function to generate and send the check-in PDF email
        await sendCheckinPdfEmail(user, business);
      }
    }
  } catch (error) {
    console.error("Error in report scheduler:", error);
  }
});

// Start the cron job
scheduler.start();


exports.getAthleteByQuery = async (req, res) => {
  try {
    const { id } = req.query; // Athlete ID from the query parameters

    if (!id) {
      return res.status(400).json({
        success: false,
        message: "Athlete ID is required as a query parameter.",
      });
    }

    // Fetch the athlete with associated athlete groups
    let athlete = await model.Athlete.findOne({
      where: { id },
      include: [
        {
          model: model.AthleteGroup, // Include associated athlete groups
          attributes: ["id", "groupName"], // Customize the attributes you want to return
          through: { attributes: [] }, // Exclude attributes from the junction table
        },
      ],
    });

    // Check if the athlete exists
    if (!athlete) {
      return res.status(404).json({
        success: false,
        message: "Athlete not found.",
      });
    }
    if (athlete.messageShown){
      athlete.messageShown=JSON.parse(athlete.messageShown)
    }
    return res.status(200).json({
      success: true,
      message: "Athlete retrieved successfully.",
      data: athlete,
    });
  } catch (error) {
    console.error("Error fetching athlete:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while fetching the athlete.",
      error: error.message,
    });
  }
};
