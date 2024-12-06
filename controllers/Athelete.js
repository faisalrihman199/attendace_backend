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

const { parse } = require("csv-parse"); // For parsing CSV files
const xlsx = require("xlsx"); // For parsing Excel files

function getRandomNumber() {
  return Math.floor(Math.random() * 5) + 3;
}

// Function to generate a unique PIN within a business
async function generateUniquePinForBusiness(pinLength, businessId) {
  let pin;
  let exists;
  let pinlength = pinLength ? pinLength : 6;
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

    // Check if the PIN already exists for any athlete in the same business
    const athleteGroupIds = await model.AthleteGroup.findAll({
      where: { businessId },
      attributes: ["id"],
    }).then((groups) => groups.map((group) => group.id));
    console.log("athlet group ids are ", athleteGroupIds, pin);
    // Check if the PIN already exists for any athlete in those groups
    exists = await model.Athlete.findOne({
      where: {
        pin,
        athleteGroupId: { [Op.in]: athleteGroupIds },
      },
    });
    console.log("existing athelete is ", exists);
  } while (exists); // Repeat until a unique PIN is found

  return pin;
}

exports.getUniquePin = async (req, res) => {
  let userId;
  if (req.user.role === "superAdmin") {
    userId = req.query.userId;
  } else {
    userId = req.user.id;
  }

  const business = await model.business.findOne({
    where: {
      userId: userId,
    },
    include: [model.reporting],
  });
  const pinLength = business.reporting.pinLength; // Default to 6 if pinLength is not defined
  const businessId = business.id;

  try {
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

exports.createAthlete = async (req, res) => {
  try {
    const {
      name,
      dateOfBirth,
      description,
      active,
      athleteGroupId,
      pin,
      email,
    } = req.body;
    const user = req.user;

    const userId = user.role === "superAdmin" ? req.query.userId : user.id;
    const business = await model.business.findOne({ where: { userId } });

    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business not found for the provided user.",
      });
    }

    const athleteGroup = await model.AthleteGroup.findOne({
      where: { id: athleteGroupId, businessId: business.id },
    });

    if (!athleteGroup) {
      return res.status(404).json({
        success: false,
        message:
          "Athlete group not found or not associated with this business.",
      });
    }

    // Check if the PIN already exists for any athlete in the same business
    const athleteGroupIds = await model.AthleteGroup.findAll({
      where: { businessId: business.id },
      attributes: ["id"],
    }).then((groups) => groups.map((group) => group.id));
    console.log("athlet group ids are ", athleteGroupIds, pin);
    // Check if the PIN already exists for any athlete in those groups
    let athlete = await model.Athlete.findOne({
      where: {
        pin,
        athleteGroupId: { [Op.in]: athleteGroupIds },
      },
    });

    // Handle athlete update or creation
    if (athlete) {
      // Remove old photo if a new one is uploaded
      if (req.file && athlete.photoPath) {
        const oldImagePath = path.join(
          __dirname,
          "../public/atheletes/",
          path.basename(athlete.photoPath)
        );
        fs.unlink(oldImagePath, (err) => {
          if (err) console.error("Error deleting old image:", err);
        });
      }

      // Update athlete information
      athlete = await athlete.update({
        name,
        dateOfBirth,
        email,
        description,
        active: active !== undefined ? active : athlete.active,
        athleteGroupId,
        photoPath: req.file
          ? `/public/atheletes/${req.file.filename}`
          : athlete.photoPath, // Update photoPath
      });

      return res.status(200).json({
        success: true,
        message: "Athlete updated successfully.",
        data: athlete,
      });
    } else {
      // Create a new athlete
      const newAthlete = await model.Athlete.create({
        pin,
        name,
        dateOfBirth,
        email,
        description,
        active: active !== undefined ? active : true,
        athleteGroupId,
        photoPath: req.file ? `/public/atheletes/${req.file.filename}` : null, // Save photoPath if uploaded
      });

      // Fetch QR code image from external API
      const qrCodeResponse = await axios.get(
        `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(
          pin
        )}&size=256x256`,
        {
          responseType: "arraybuffer",
        }
      );

      // Email content with embedded QR code
      const finalHtmlContent = `
        <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.5; margin: 0; padding: 20px; background-color: #f9f9f9;">
                <div style="max-width: 600px; margin: auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);">
                    <h1 style="color: #333; font-size: 24px; margin-bottom: 10px;">Welcome ${name}!</h1>
                    <p style="font-size: 16px; color: #555;">We're excited to have you join our athletic program.</p>
                    <p style="font-size: 16px; color: #555;">Your unique PIN is: <strong style="font-size: 20px;">${pin}</strong></p>
                    <p style="font-size: 16px; color: #555;">To access your profile, please keep your PIN safe and scan the QR code below:</p>
                    <div style="text-align: center; margin: 20px 0;">
                        <img src="cid:qrcodeImage" alt="Embedded QR Code" style="width: 200px; height: 200px; border: 1px solid #ccc;"/>
                    </div>
                    <p style="font-size: 16px; color: #555;">If you have any questions, feel free to reach out to us.</p>
                    <div style="margin-top: 20px; font-size: 14px; color: #777;">
                        <p>Best regards,<br>${business.name}</p>
                    </div>
                </div>
            </body>
        </html>
      `;

      // Send the email
      const mailOptions = {
        to: email,
        subject: "Welcome to Our Athletic Program!",
        html: finalHtmlContent,
        attachments: [
          {
            filename: "qrcode.png",
            content: qrCodeResponse.data,
            contentType: "image/png",
            cid: "qrcodeImage", // same as the cid in the HTML img tag
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
    
    const business = await model.business.findByPk(businessId)
    console.log("business is ", business);

    // Check if the PIN already exists for any athlete in the same business
    const athleteGroupIds = await model.AthleteGroup.findAll({
      where: { businessId },
      attributes: ["id"],
    }).then((groups) => groups.map((group) => group.id));
    console.log("athlet group ids are ", athleteGroupIds, pin);
    // Check if the PIN already exists for any athlete in those groups
    const athlete = await model.Athlete.findOne({
      where: {
        pin,
        athleteGroupId: { [Op.in]: athleteGroupIds },
      },
    });

    if (!athlete) {
      return res
        .status(404)
        .json({ success: false, message: "Athlete not found." });
    }

    // Get the current date and time
    const currentDate = new Date();
    const checkinDate = currentDate.toISOString().split("T")[0]; // Format as YYYY-MM-DD
    const checkinTime = currentDate.toTimeString().split(" ")[0]; // Format as HH:MM:SS

    // Create a new check-in record
    const checkIn = await model.checkin.create({
      athleteId: athlete.id, // Associate check-in with the athlete
      checkinDate,
      checkinTime,
    });

    // Send email notification to the athlete
    const emailOptions = {
      to: athlete.email, // Assuming the Athlete model has an `email` field
      subject: "Check-In Successful",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
          <h2 style="color: #4CAF50;">Check-In Confirmation</h2>
          <p>Dear ${athlete.name},</p>
          <p>We are pleased to inform you that your check-in on <strong>${checkinDate}</strong> at <strong>${checkinTime}</strong> was successful.</p>
          <p>Thank you for visiting us. We hope you have a great experience!</p>
          <p style="margin-top: 20px;">Best Regards,</p>
          <p><strong>${business.name}</strong></p>
        </div>
      `,
    };

    await sendEmail(emailOptions);

    return res.status(201).json({
      success: true,
      message: "Athlete checked in successfully.",
      data: {
        checkinDate: checkIn.checkinDate,
        checkinTime: checkIn.checkinTime,
        athleteName: athlete.name,
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
      athleteName,
      groupName,
      athleteId,
    } = req.query; // Extract search parameters
    const offset = (page - 1) * limit;

    // Find the business associated with the userId
    const business = await model.business.findOne({ where: { userId } });
    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business not found for the provided user.",
      });
    }

    // Build the where clause for Athlete
    const athleteWhereClause = {};
    if (athleteName) {
      athleteWhereClause.name = { [Op.like]: `%${athleteName}%` }; // Search for name containing athleteName
    }
    if (athleteId) {
      athleteWhereClause.pin = athleteId; // Match exact athleteId
    }

    // Build the where clause for AthleteGroup
    const groupWhereClause = { businessId: business.id }; // Always filter by businessId
    if (groupName) {
      groupWhereClause.groupName = { [Op.like]: `%${groupName}%` }; // Search for name containing groupName
    }

    // Fetch athletes with filtering, pagination, and join on AthleteGroups
    const { count, rows: athletes } = await model.Athlete.findAndCountAll({
      where: athleteWhereClause,
      include: [
        {
          model: model.AthleteGroup,
          where: groupWhereClause,
          attributes: ["groupName"],
          required: true, // Only include athletes that belong to a group in the business
        },
      ],
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });
    console.log("Athletes:", athletes);
    // Map athletes to include their group name
    const athletesWithGroupNames = athletes.map((athlete) => ({
      ...athlete.dataValues,
      groupName: athlete.athleteGroup.groupName,
    }));

    // Prepare the response with pagination details
    const response = {
      success: true,
      message: "Athletes retrieved successfully.",
      data: {
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        currentPage: parseInt(page, 10),
        athletes: athletesWithGroupNames,
      },
    };

    return res.status(200).json(response);
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
      athleteName,
      pin,
      groupName,
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
    });

    if (!athleteGroups || athleteGroups.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No athlete groups found for this business.",
      });
    }

    // Collect athlete IDs by querying active athletes in each group
    const athleteIds = await model.Athlete.findAll({
      where: {
        athleteGroupId: athleteGroups.map((group) => group.id),
        active: true,
      },
      attributes: ["id"],
    }).then((athletes) => athletes.map((athlete) => athlete.id));

    if (athleteIds.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No active athletes found in the associated athlete groups.",
      });
    }

    // Construct search condition for athletes
    const searchCondition = {};
    if (athleteName) {
      searchCondition.name = { [Op.like]: `%${athleteName}%` }; // Search by athlete name
    }
    if (pin) {
      searchCondition.pin = pin; // Search by pin
    }
    if (groupName) {
      const athleteGroupIds = await model.AthleteGroup.findAll({
        where: { groupName: { [Op.like]: `%${groupName}%` } },
        attributes: ["id"],
      }).then((groups) => groups.map((group) => group.id));

      searchCondition.athleteGroupId = athleteGroupIds; // Search by group name
    }

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

    // Fetch check-ins for the athletes with pagination, search, and date filter
    const { count, rows: checkins } = await model.checkin.findAndCountAll({
      where: {
        athleteId: athleteIds,
        ...dateCondition, // Apply date range condition here
      },
      include: [
        {
          model: model.Athlete,
          attributes: ["id", "pin", "name", "photoPath"],
          where: searchCondition, // Apply search conditions here
          include: [
            {
              model: model.AthleteGroup,
              attributes: ["groupName"],
            },
          ],
        },
      ],
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });

    // Prepare the data to include athlete pin, name, group name, check-in time, and date
    const checkinData = checkins.map((checkin) => ({
      id: checkin.id,
      createdAt: checkin.checkinDate, // Check-in date
      checkinTime: checkin.checkinTime, // Adjust if there's a separate time field
      athlete: {
        pin: checkin.Athlete.pin,
        name: checkin.Athlete.name,
        groupName: checkin.Athlete.athleteGroup.groupName || null, // Group name if available
        photoPath: checkin.Athlete.photoPath || null, // Photo path if available
      },
    }));

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

exports.getAthleteCheckinsPdf = async (req, res) => {
  try {
    const { athleteName, pin, groupName } = req.query;
    const user = req.user;
    const userId = user.role === "superAdmin" ? req.query.userId : user.id;

    const business = await model.business.findOne({ where: { userId } });
    if (!business) {
      return res.status(404).json({
        success: false,
        message: "Business not found for the provided user.",
      });
    }

    const athleteGroups = await model.AthleteGroup.findAll({
      where: { businessId: business.id },
    });
    if (!athleteGroups || athleteGroups.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No athlete groups found for this business.",
      });
    }

    const athleteIds = await model.Athlete.findAll({
      where: {
        athleteGroupId: athleteGroups.map((group) => group.id),
        active: true,
      },
      attributes: ["id"],
    }).then((athletes) => athletes.map((athlete) => athlete.id));

    if (athleteIds.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No active athletes found in the associated athlete groups.",
      });
    }

    const searchCondition = {};
    if (athleteName) {
      searchCondition.name = { [Op.like]: `%${athleteName}%` };
    }
    if (pin) {
      searchCondition.pin = pin;
    }
    if (groupName) {
      const athleteGroupIds = await model.AthleteGroup.findAll({
        where: { groupName: { [Op.like]: `%${groupName}%` } },
        attributes: ["id"],
      }).then((groups) => groups.map((group) => group.id));
      searchCondition.athleteGroupId = athleteGroupIds;
    }

    const checkins = await model.checkin.findAll({
      where: { athleteId: athleteIds },
      include: [
        {
          model: model.Athlete,
          attributes: ["id", "pin", "name"],
          where: searchCondition,
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
      return res.status(404).json({
        success: false,
        message: "No check-ins found for the given criteria.",
      });
    }

    // Create PDF
    const doc = new PDFDocument();
    const filename = `athlete_checkins_${Date.now()}.pdf`;
    res.setHeader("Content-disposition", `attachment; filename=${filename}`);
    res.setHeader("Content-type", "application/pdf");
    doc.pipe(res);

    // Title
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
      // Draw background for header
      doc
        .rect(
          startX + columnWidths.slice(0, i).reduce((a, b) => a + b, 0),
          currentY,
          columnWidths[i],
          20
        )
        .fillAndStroke("#d0f0c0", "black") // Light green fill with black border
        .lineWidth(1)
        .stroke();

      // Add header text
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
      const checkinDate = new Date(checkin.checkinDate).toLocaleDateString();
      const checkinTime = checkin.checkinTime;
      const row = [
        index + 1,
        athlete.name,
        athlete.pin,
        athlete.athleteGroup.groupName || "N/A",
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

    doc.end();
  } catch (error) {
    console.error("Error fetching active athlete check-ins:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while fetching active athlete check-ins.",
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
    const { athleteGroupId } = req.body; // Get athleteGroupId from the request body

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

    const athleteGroupIds = await model.AthleteGroup.findAll({
      where: { businessId: business.id },
      attributes: ["id"],
    }).then((groups) => groups.map((group) => group.id));

    // Step 3: Process athletes data
    const processedAthletes = [];
    for (const row of athletesData) {
      let {
        pin,
        name,
        description = "",
        dateOfBirth,
        athleteGroupClass,
        athleteGroupName,
        email,
      } = row;

      // Determine athlete group
      let athleteGroup;
      if (athleteGroupId) {
        athleteGroup = await model.AthleteGroup.findOne({
          where: { id: athleteGroupId, businessId: business.id },
        });
        if (!athleteGroup) {
          return res.status(404).json({
            success: false,
            message: "Athlete group with the provided ID not found.",
          });
        }
      } else {
        athleteGroup = await model.AthleteGroup.findOne({
          where: {
            businessId: business.id,
            category: athleteGroupClass,
            groupName: athleteGroupName,
          },
        });

        if (!athleteGroup) {
          athleteGroup = await model.AthleteGroup.create({
            businessId: business.id,
            category: athleteGroupClass,
            groupName: athleteGroupName,
          });
        }
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
        where: {
          pin,
          athleteGroupId: { [Op.in]: athleteGroupIds },
        },
      });

      if (existingAthlete) {
        // Update existing athlete
        await existingAthlete.update({
          name,
          dateOfBirth,
          description,
          email,
          athleteGroupId: athleteGroup.id,
        });
      } else {
        // Create new athlete
        const newAthlete = await model.Athlete.create({
          pin,
          name,
          dateOfBirth,
          description,
          email,
          athleteGroupId: athleteGroup.id,
        });
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

    // Step 2: Find AthleteGroup IDs under the business
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

    // Step 3: Check if any employee exists with the given pin in the athlete groups
    const athelete = await model.Athlete.findOne ({
      where: {
        athleteGroupId: athleteGroupIds, // Match against the list of AthleteGroup IDs
        pin,
      },
    });

    if (!athelete) {
      return res.status(200).json({
        success: true,
        message: "it is a valid pin",
      });
    }

    // If an employee is found
    return res.status(200).json({
      success: false,
      message: "pin already exists for the business.",
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
