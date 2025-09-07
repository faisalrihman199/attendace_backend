const model = require("../models/index");
const bcrypt = require("bcrypt");
const speakeasy = require("speakeasy");
const userSchema = require("../schemas/userSchemas");
const { sendEmail } = require("../config/nodemailer");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { log } = require("console");
const { paymentHistory } = require("../models");
const fs = require("fs");
const path = require("path");
const sequelize = require("../config/db"); // Adjust the path as necessary
const { Op } = require('sequelize');
const { business } = require(".");

require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET);

const algorithm = "aes-256-cbc";
const secretKey = process.env.ENCRYPTION_KEY;

// Use a secure key stored in environment variables
const iv = crypto.randomBytes(16); // Initialization vector

// Encrypt function
const encrypt = (text) => {
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(secretKey), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
};

// Decrypt function
const decrypt = (text) => {
  const textParts = text.split(":");
  const iv = Buffer.from(textParts.shift(), "hex");
  const encryptedText = Buffer.from(textParts.join(":"), "hex");
  const decipher = crypto.createDecipheriv(
    algorithm,
    Buffer.from(secretKey),
    iv
  );
  let decrypted = decipher.update(encryptedText);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
};

exports.sendOtp = async (req, res) => {
  try {
    // Validate request body
    const { error } = userSchema.sendOtpSchema.validate(req.body);
    if (error) {
      return res
        .status(400)
        .json({ success: false, message: error.details[0].message });
    }

    const { firstName, lastName, email, password } = req.body;

    // Check if email already exists in the main user table
    const existingUser = await model.user.findOne({ where: { email } });
    if (existingUser) {
      return res
        .status(400)
        .json({ success: false, message: "Email already exists" });
    }

    // Generate OTP using speakeasy
    const otp = speakeasy.totp({
      secret: email,
      encoding: "base32",
    });

    // Check for existing temporary user
    const existingTempUser = await model.tempUser.findOne({ where: { email } });
    if (existingTempUser) {
      // Delete the existing temporary user
      await model.tempUser.destroy({ where: { email } });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create a new temporary user
    await model.tempUser.create({
      firstName,
      lastName,
      email,
      password: hashedPassword,
      role: "admin",
    });

    // Fetch OTP email template from the database
    const emailTemplate = await model.emailTemplate.findOne({
      where: { name: 'otp_email_template' },  // Replace with your actual template name
    });

    if (!emailTemplate) {
      return res.status(500).json({ success: false, message: 'Email template not found.' });
    }

    // Replace placeholders in the template
    let emailHtml = emailTemplate.htmlContent.replace('{{otp}}', otp);
    emailHtml = emailHtml.replace('{{firstName}}', firstName);

    // Create the email options
    const mailOptions = {
      to: email,
      subject: emailTemplate.subject,
      html: emailHtml,  // Send HTML content instead of plain text
    };

    // Send OTP email using the template
    await sendEmail(mailOptions);

    // Respond with success
    res.json({ success: true, message: "OTP sent to your email." });
  } catch (error) {
    console.error("Error sending OTP:", error);
    res.status(500).json({
      success: false,
      message: "An error occurred while sending OTP.",
    });
  }
};

exports.verifyOtp = async (req, res) => {
  const transaction = await sequelize.transaction(); // Start a transaction
  try {
    const { error } = userSchema.verifyOtpSchema.validate(req.body);
    if (error) {
      return res
        .status(400)
        .json({ success: false, message: error.details[0].message });
    }

    const { email, otp } = req.body;
    console.log("email and otp are:", email, otp);

    // Find the user in the tempUser table
    const tempUser = await model.tempUser.findOne({ where: { email } });
    if (!tempUser) {
      return res.json({ success: false, message: "User not found" });
    }

    // Verify OTP using speakeasy
    const isValidOtp = speakeasy.totp.verify({
      secret: email, // Same secret used during OTP generation
      encoding: "base32",
      token: otp,
      window: 1,
    });

    if (isValidOtp) {
      // Check if a user with the same email already exists (including soft-deleted users)
      const existingUser = await model.user.findOne({
        where: { email },
        paranoid: false, // Include soft-deleted records
      });

      if (existingUser) {
        if (existingUser.deletedAt) {
          // If the user is soft-deleted, restore them
          await existingUser.restore({ transaction });
          console.log(`Restored user with email: ${email}`);
        } else {
          return res.json({
            success: false,
            message: "User with this email already exists and is active.",
          });
        }
      } else {
        // If no user exists, create a new one
        await model.user.create(
          {
            firstName: tempUser.firstName,
            lastName: tempUser.lastName,
            email: tempUser.email,
            password: tempUser.password,
            role: tempUser.role,
          },
          { transaction }
        );
      }

      // Delete the tempUser record
      await model.tempUser.destroy({ where: { email }, transaction });

      // Commit the transaction
      await transaction.commit();

      res.json({ success: true, message: "User registered successfully" });
    } else {
      // Rollback the transaction in case of invalid OTP
      await transaction.rollback();
      res.json({ success: false, message: "Invalid OTP or OTP expired." });
    }
  } catch (error) {
    // Rollback the transaction in case of any error
    if (transaction) await transaction.rollback();
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { error } = userSchema.loginSchema.validate(req.body);
    if (error) {
      return res
        .status(400)
        .json({ success: false, message: error.details[0].message });
    }
    const { email, password } = req.body;

    // Find the user in the database, including the subscription and business models
    const user = await model.user.findOne({
      where: { email },
      include: [
        { model: model.subscription },
        { model: model.business }, // Include the business model
      ],
    });

    if (!user) {
      return res.json({ success: false, message: "User not found" });
    }

    // Compare the password
    const isValidPassword = await bcrypt.compare(password, user.password);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    if (isValidPassword) {
      // Check subscription status
      let subscriptionStatus = user.subscription
        ? user.subscription.subscriptionStatus
        : "inactive";
      let trial = false;
      // If inactive, check trialPaid or createdAt within 1 month
      if (subscriptionStatus === "inactive") {
        const createdAt = new Date(user.createdAt);
        const trialDuration = 30 * 24 * 60 * 60 * 1000; // 30 days
        const trialEndsAt = new Date(createdAt.getTime() + trialDuration);
        const now = new Date();

        if (user?.business?.trialPaid || now < trialEndsAt) {
          subscriptionStatus = "active";
          if (!user?.business?.trialPaid) {
            trial = trialEndsAt;
          }
        }
      }


      // Check if the user has a business
      const hasBusiness = user.business ? user.business.id : false;

      if (hasBusiness) {
        if (user?.business?.status !== 'active') {
          return res.json({ success: false, message: "Business is inactive" });
        }
      }
      res.json({
        success: true,
        message: "Login successful",
        data: {
          token,
          trial,
          role: user.role,
          subscriptionStatus,
          business: hasBusiness,
        },
      });
    } else {
      res.json({ success: false, message: "Invalid password" });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.verifyOtpOnly = async (req, res) => {
  try {
    const { email, otp } = req.body;

    // Check if the user exists
    const user = await model.user.findOne({ where: { email } });
    if (!user) {
      return res.json({ success: false, message: "Email does not exist" });
    }

    // Verify OTP
    const isValidOtp = speakeasy.totp.verify({
      secret: email,
      encoding: "base32",
      token: otp,
      window: 1, // Allow for a small time window for verification
    });

    if (isValidOtp) {
      res.json({ success: true, message: "otp verified" });
    } else {
      res.json({ success: false, message: "Invalid OTP or OTP expired." });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.sendPasswordResetOtp = async (req, res) => {
  const { error } = userSchema.sendPasswordResetOtpSchema.validate(req.body);
  if (error) {
    return res
      .status(400)
      .json({ success: false, message: error.details[0].message });
  }
  try {
    const { email } = req.body;

    // Check if the user exists
    const user = await model.user.findOne({ where: { email } });
    if (!user) {
      return res.json({ success: false, message: "Email does not exist" });
    }

    // Generate OTP
    const otp = speakeasy.totp({
      secret: email,
      encoding: "base32",
    });

    // Send OTP to user's email
    const mailOptions = {
      to: email,
      subject: "Your Password Reset OTP",
      text: `Your OTP is ${otp}. It will expire in 5 minutes.`,
    };
    await sendEmail(mailOptions);
    res.json({ success: true, message: "OTP sent to your email." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.verifyOtpAndResetPassword = async (req, res) => {
  try {
    const { email, otp, password } = req.body;

    // Check if the user exists
    const user = await model.user.findOne({ where: { email } });
    if (!user) {
      return res.json({ success: false, message: "Email does not exist" });
    }

    // Verify OTP
    const isValidOtp = speakeasy.totp.verify({
      secret: email,
      encoding: "base32",
      token: otp,
      window: 4,
    });

    if (isValidOtp) {
      // Hash the new password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Update the user's password
      console.log("hashed password is", hashedPassword);
      user.password = hashedPassword;
      console.log();
      await user.save();

      res.json({
        success: true,
        message: "Password has been reset successfully.",
      });
    } else {
      res.json({ success: false, message: "Invalid OTP or OTP expired." });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.savePaymentDetails = async (req, res) => {
  const userId = req.user.id;
  const { cardHolderName, cardNumber, cvc, expiry, region } = req.body;

  try {
    // Encrypt sensitive data
    const CardNumber = encrypt(cardNumber);
    const CVC = encrypt(cvc);
    const Expiry = encrypt(expiry);

    // Save payment details in the database
    const payment = await model.paymentDetails.create({
      cardHolderName,
      CardNumber,
      CVC,
      Expiry,
      region,
      userId,
    });

    res.json({
      success: true,
      message: "Payment details saved successfully",
      paymentId: payment.id,
    });
  } catch (error) {
    console.error("Error saving payment details:", error);
    res
      .status(500)
      .json({ success: false, message: "Error saving payment details" });
  }
};

exports.getPaymentDetails = async (req, res) => {
  const userId = req.user.id;

  try {
    // Find the payment record
    const payment = await model.paymentDetails.findOne({
      where: { userId: userId },
    });
    if (!payment) {
      return res
        .status(404)
        .json({ success: false, message: "Payment details not found" });
    }

    // Decrypt sensitive data
    const decryptedCardNumber = decrypt(payment.CardNumber);
    const decryptedCVC = decrypt(payment.CVC);
    const decryptedExpiry = decrypt(payment.Expiry);

    res.json({
      success: true,
      message: "payment retrieved successfully",
      data: {
        cardHolderName: payment.cardHolderName,
        cardNumber: decryptedCardNumber,
        cvc: decryptedCVC,
        expiry: decryptedExpiry,
        region: payment.region,
      },
    });
  } catch (error) {
    console.error("Error retrieving payment details:", error);
    res
      .status(500)
      .json({ success: false, message: "Error retrieving payment details" });
  }
};

// exports.createSubscription = async (req, res) => {
//     const userId = req.user.id; // Get userId from the request
//     const priceId = "price_1Q2zXGJnCuHDmbHeo7h5RDCY"; // Your hardcoded priceId

//     try {
//         // Step 1: Fetch the payment details from the database using userId
//         const paymentDetails = await model.paymentDetails.findOne({ where: { userId } });

//         if (!paymentDetails) {
//             return res.status(404).json({ error: 'Payment details not found for user.' });
//         }

//         // Step 2: Decrypt the card details
//         const decryptedCardInfo = decrypt(paymentDetails.CardNumber); // Ensure this returns a string
//         const decryptedCVC = decrypt(paymentDetails.CVC); // Ensure this returns a string
//         const decryptedExpiry = decrypt(paymentDetails.Expiry); // Ensure this returns a string in format "MM/YYYY"

//         // Extract the month and year from the decrypted expiry
//         const [expMonth, expYear] = decryptedExpiry.split('/').map(num => parseInt(num, 10));

//         // Step 3: Create a payment method in Stripe
//         const paymentMethod = await stripe.paymentMethods.create({
//             type: 'card',
//             card: {
//                 number: decryptedCardInfo,
//                 exp_month: expMonth,
//                 exp_year: expYear,
//                 cvc: decryptedCVC,
//             },
//         });

//         // Step 4: Create a customer in Stripe using the payment method
//         const customer = await stripe.customers.create({
//             payment_method: paymentMethod.id,
//             metadata: {
//                 user_id: userId,
//             },
//         });

//         // Step 5: Create the subscription using the priceId
//         const subscription = await stripe.subscriptions.create({
//             customer: customer.id,
//             items: [{ price: priceId }],
//             expand: ['latest_invoice.payment_intent'],
//         });

//         // Respond with subscription details
//         res.status(201).json({
//             subscriptionId: subscription.id,
//             customerId: customer.id,
//             status: subscription.status,
//         });
//     } catch (error) {
//         console.error('Error creating subscription:', error);

//         // Handle specific Stripe errors
//         if (error.type === 'StripeCardError') {
//             return res.status(400).json({ error: 'Your card was declined.' });
//         } else if (error.type === 'StripeInvalidRequestError') {
//             return res.status(400).json({ error: 'Invalid request: ' + error.message });
//         }

//         // Generic error response
//         res.status(500).json({ error: 'An error occurred while creating the subscription.' });
//     }
// };

exports.createSubscription = async (req, res) => {
  let userId = req.user.id; // Get userId from the request
  if (req.user.role === "superAdmin") {
    userId = req.query.userId;
  }
  const price = req.query.price;
  const { paymentMethodId } = req.body; // Get paymentMethodId from the request body
  const paymentPlan = await model.plan.findOne({ where: { planPrice: price } });


  const user = await model.user.findOne({ where: { id: userId } });

  console.log("Payment Method ID:", paymentMethodId); // Log paymentMethodId for debugging

  if (!paymentMethodId) {
    return res.status(400).json({ error: "Payment method ID is required." });
  }

  const priceId = paymentPlan.planId;
  const planId = paymentPlan.id;


  try {
    // Step 1: Search if the customer already exists by userId in metadata
    const customers = await stripe.customers.search({
      query: `metadata['user_id']:'${userId}'`,
    });




    let customer;
    if (customers.data.length > 0) {
      // If customer exists, use the existing customer
      customer = customers.data[0];
    } else {
      // If no customer exists, create a new one
      customer = await stripe.customers.create({
        name: `${user.firstName} ${user.lastName}`,
        email: user.email,
        metadata: {
          user_id: userId,
        },
      });
    }


    // Step 2: Check for existing active subscriptions
    const existingSubscription = await stripe.subscriptions.list({
      customer: customer.id,
      status: "active",
      limit: 1,
    });

    if (existingSubscription.data.length > 0) {
      return res
        .status(200)
        .json({
          success: false,
          message: "User already has an active subscription.",
        });
    }
    console.log("Before Attach :", paymentMethodId);

    // Step 3: Attach the payment method to the customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customer.id,
    });

    // Step 4: Set the payment method as the default payment method
    await stripe.customers.update(customer.id, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    // Step 5: Create the subscription using the priceId
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [
        { price: priceId }, // This is where the priceId is used
      ],
      expand: ["latest_invoice.payment_intent"],
    });

    // Save subscription details to your database using Sequelize models
    const createdSubscription = await model.subscription.create({
      subscriptionId: subscription.id,
      subscriptionStatus: subscription.status,
      userId: userId, // Assuming userId is stored in the subscription model
      paymentPlanId: planId, // Hardcoded planId as 1
    });

    // Respond with subscription details
    res.status(201).json({
      subscriptionId: subscription.id,
      customerId: customer.id,
      status: subscription.status,
      subscriptionInDB: createdSubscription, // Return the created subscription from DB
    });
  } catch (error) {
    // Handle specific Stripe errors
    if (error.type === "StripeCardError") {
      return res.status(400).json({ error: "Your card was declined." });
    } else if (error.type === "StripeInvalidRequestError") {
      return res
        .status(400)
        .json({ error: "Invalid request: " + error.message });
    }

    // Generic error response
    res
      .status(500)
      .json({ error: "An error occurred while creating the subscription." });
  }
};

exports.cancelSubscription = async (req, res) => {
  const userId = req.user.id; // Get the userId from the request

  try {
    // Step 1: Find the subscription in your database that belongs to the user
    const subscription = await model.subscription.findOne({
      where: { userId, subscriptionStatus: "active" }, // Look for an active subscription for the user
    });

    if (!subscription) {
      return res
        .status(404)
        .json({ error: "No active subscription found for the user." });
    }

    const subscriptionId = subscription.subscriptionId; // Get the subscription ID from the database

    // Step 2: Cancel the subscription in Stripe
    const canceledSubscription = await stripe.subscriptions.cancel(
      subscriptionId
    );

    // Step 3: Update the subscription status in the database
    await model.subscription.update(
      { subscriptionStatus: canceledSubscription.status }, // Update with the new status from Stripe
      { where: { subscriptionId } }
    );

    // Respond with success
    res.status(200).json({
      message: "Subscription canceled successfully.",
      subscription: {
        subscriptionId: canceledSubscription.id,
        status: canceledSubscription.status,
      },
    });
  } catch (error) {
    console.error("Error canceling subscription:", error);

    // Handle specific Stripe errors
    if (error.type === "StripeInvalidRequestError") {
      return res
        .status(400)
        .json({ error: "Invalid request: " + error.message });
    }

    // Generic error response
    res
      .status(500)
      .json({ error: "An error occurred while canceling the subscription." });
  }
};

// Example functions to handle various events
function handlePaymentSuccess(event) {
  const subscription = event.data.object; // The subscription object
  const customerId = subscription.customer; // Customer ID
  console.log(
    `Payment succeeded for subscription ${subscription.id}, customer ${customerId}`
  );
  // Add your logic for payment success (e.g., send confirmation emails, update DB)
}

function handleSubscriptionUpdate(event) {
  const subscription = event.data.object; // The subscription object
  const customerId = subscription.customer; // Customer ID
  console.log(
    `Subscription updated: ${subscription.id}, customer: ${customerId}`
  );
  // Add logic to handle subscription updates (e.g., status changes)
}

function handleSubscriptionCancellation(event) {
  const subscription = event.data.object; // The subscription object
  const customerId = subscription.customer; // Customer ID
  console.log(
    `Subscription canceled: ${subscription.id}, customer: ${customerId}`
  );
  // Add logic to handle subscription cancellation
}

function handlePaymentFailure(event) {
  const invoice = event.data.object; // The invoice object
  const customerId = invoice.customer; // Customer ID
  console.log(
    `Payment failed for invoice ${invoice.id}, customer: ${customerId}`
  );
  // Handle payment failure (e.g., notify customer, retry payments)
}

exports.webhook = async (req, res) => {
  const event = req.body;

  try {
    switch (event.type) {
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const stripeSubscriptionId = invoice.subscription; // Get the subscription ID from Stripe

        // Fetch the customer details to get metadata (if needed)
        const customer = await stripe.customers.retrieve(customerId);
        // const userId = customer.metadata.user_id; // Use if you still need user ID for other purposes

        // Fetch subscription from your database using the stripeSubscriptionId
        const subscriptionRecord = await model.subscription.findOne({
          where: {
            subscriptionId: stripeSubscriptionId,
          },
        });

        if (!subscriptionRecord) {
          console.error(
            `No subscription found for Stripe ID: ${stripeSubscriptionId}`
          );
          return res
            .status(400)
            .send(`No subscription found for ID: ${stripeSubscriptionId}`);
        }

        const subscriptionId = subscriptionRecord.id; // Get the internal ID from your subscriptions table

        // Check if a record already exists with the same invoiceId and status
        const existingHistory = await paymentHistory.findOne({
          where: {
            invoiceId: invoice.id,
            status:
              event.type === "invoice.payment_succeeded"
                ? "succeeded"
                : "failed",
          },
        });

        if (!existingHistory) {
          await paymentHistory.create({
            invoiceId: invoice.id,
            invoiceNumber: invoice.number,
            amount: invoice.amount_due / 100,
            status:
              event.type === "invoice.payment_succeeded"
                ? "succeeded"
                : "failed",
            date: new Date(invoice.created * 1000),
            subscriptionId: subscriptionId, // Store the internal subscription ID
          });
          console.log(
            `Payment ${event.type === "invoice.payment_succeeded"
              ? "succeeded"
              : "failed"
            } for invoice: ${invoice.id}`
          );
        } else {
          console.log(`Duplicate entry prevented for invoice: ${invoice.id}`);
        }
        break;
      }

      case "payment_intent.succeeded":
      case "payment_intent.payment_failed": {
        const paymentIntent = event.data.object;
        const customerId = paymentIntent.customer;

        // Fetch the customer details to get metadata (if needed)
        const customer = await stripe.customers.retrieve(customerId);
        const stripeSubscriptionId = paymentIntent.invoice
          ? (await stripe.invoices.retrieve(paymentIntent.invoice)).subscription
          : null; // Get subscription from invoice

        // Fetch subscription from your database using the stripeSubscriptionId
        const subscriptionRecord = await model.subscription.findOne({
          where: {
            subscriptionId: stripeSubscriptionId,
          },
        });

        if (!subscriptionRecord) {
          console.error(
            `No subscription found for Stripe ID: ${stripeSubscriptionId}`
          );
          return res
            .status(400)
            .send(`No subscription found for ID: ${stripeSubscriptionId}`);
        }

        const subscriptionId = subscriptionRecord.id; // Get the internal ID from your subscriptions table

        // Check if a record already exists with the same invoiceId and status
        const existingHistory = await paymentHistory.findOne({
          where: {
            invoiceId: paymentIntent.invoice || paymentIntent.id,
            status:
              event.type === "payment_intent.succeeded"
                ? "succeeded"
                : "failed",
          },
        });

        if (!existingHistory) {
          await paymentHistory.create({
            invoiceId: paymentIntent.invoice || null,
            invoiceNumber: paymentIntent.id,
            amount: paymentIntent.amount / 100,
            status:
              event.type === "payment_intent.succeeded"
                ? "succeeded"
                : "failed",
            date: new Date(paymentIntent.created * 1000),
            subscriptionId: subscriptionId, // Store the internal subscription ID
          });
          console.log(
            `Payment intent ${event.type === "payment_intent.succeeded" ? "succeeded" : "failed"
            }: ${paymentIntent.id}`
          );
        } else {
          console.log(
            `Duplicate entry prevented for payment intent: ${paymentIntent.id}`
          );
        }
        break;
      }

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error(`Webhook error: ${err.message}`);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
};

exports.getPaymentDetails = async (req, res) => {
  try {
    const userId = req.user.id; // Assumes req.user is populated with authenticated user info

    // Fetch payment histories for the user
    const userPaymentHistories = await paymentHistory.findAll({
      where: { userId: userId },
      order: [["date", "DESC"]], // Orders by date, most recent first
    });

    if (userPaymentHistories.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No payment histories found for this user.",
      });
    }

    // Respond with the user's payment histories
    res.status(200).json({
      success: true,
      message: "Payment histories retrieved successfully.",
      data: userPaymentHistories,
    });
  } catch (error) {
    console.error(`Error fetching payment histories: ${error.message}`);
    res.status(500).json({
      success: false,
      message: "An error occurred while retrieving payment histories.",
    });
  }
};

exports.addOrUpdateSuperAdmin = async (req, res) => {
  try {
    const { id } = req.query; // Get ID from query if available
    const { firstName, lastName, email, password } = req.body;

    // Check if email already exists
    let existingUser = await model.user.findOne({ where: { email } });

    // If updating, fetch the existing user
    if (id) {
      if (!existingUser) {
        return res
          .status(404)
          .json({ success: false, message: "Superadmin not found." });
      }

      // Remove old image if new image is uploaded
      if (req.file && existingUser.photoPath) {
        const oldImagePath = path.join(
          __dirname,
          "../public/superadmin/",
          path.basename(existingUser.photoPath)
        );
        fs.unlink(oldImagePath, (err) => {
          if (err) console.error("Error deleting old image:", err);
        });
      }

      // Update user fields and save
      const hashedPassword = password
        ? await bcrypt.hash(password, 10)
        : existingUser.password;
      const newPhotoPath = req.file
        ? `/public/superadmin/${req.file.filename}`
        : existingUser.photoPath;

      await model.user.update(
        {
          firstName,
          lastName,
          password: hashedPassword,
          photoPath: newPhotoPath, // Update photoPath if a new image is uploaded
        },
        { where: { id } }
      );

      return res
        .status(200)
        .json({ success: true, message: "Superadmin updated successfully." });
    } else {
      // If creating a new superadmin
      if (existingUser) {
        return res
          .status(400)
          .json({ success: false, message: "Email already exists." });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const photoPath = req.file
        ? `/public/superadmin/${req.file.filename}`
        : null;

      const newSuperAdmin = await model.user.create({
        firstName,
        lastName,
        email,
        password: hashedPassword,
        role: "superAdmin",
        photoPath, // Store new image path if uploaded
      });

      return res
        .status(201)
        .json({
          success: true,
          message: "Superadmin created successfully.",
          data: newSuperAdmin,
        });
    }
  } catch (error) {
    console.error("Error adding or updating superadmin:", error);
    return res
      .status(500)
      .json({ success: false, message: "An error occurred.", error });
  }
};

exports.contactUs = async (req, res) => {
  const {
    firstName,
    lastName,
    businessName,
    phoneNumber,
    email,
    message,
  } = req.body;

  // Validate the request body
  if (
    !firstName ||
    !lastName ||
    !businessName ||
    !phoneNumber ||
    !email ||
    !message
  ) {
    return res
      .status(400)
      .json({ success: false, message: "All fields are required." });
  }

  const contactEmail = process.env.CONTACT_EMAIL; // Get contact email from env variables

  // Prepare the email content
  const emailContent = `
        <h1 style="font-family: Arial, sans-serif; color: #333;">New Contact Message</h1>
        <p style="font-family: Arial, sans-serif; color: #555;">You have received a new message from the contact form:</p>
        <hr style="border: 1px solid #ccc;">
        <h2 style="font-family: Arial, sans-serif; color: #333;">Contact Details</h2>
        <p style="font-family: Arial, sans-serif; color: #555;"><strong>First Name:</strong> ${firstName}</p>
        <p style="font-family: Arial, sans-serif; color: #555;"><strong>Last Name:</strong> ${lastName}</p>
        <p style="font-family: Arial, sans-serif; color: #555;"><strong>Business Name:</strong> ${businessName}</p>
        <p style="font-family: Arial, sans-serif; color: #555;"><strong>Phone Number:</strong> ${phoneNumber}</p>
        <p style="font-family: Arial, sans-serif; color: #555;"><strong>Email:</strong> ${email}</p>
        <hr style="border: 1px solid #ccc;">
        <h2 style="font-family: Arial, sans-serif; color: #333;">Message</h2>
        <p style="font-family: Arial, sans-serif; color: #555;">${message}</p>
        <footer style="margin-top: 20px; font-family: Arial, sans-serif; color: #888;">
            <p>This message was sent from the Contact Us form on your website.</p>
        </footer>
    `;

  // Prepare mail options
  const mailOptions = {
    to: contactEmail,
    subject: `New contact message from ${firstName} ${lastName}`,
    html: emailContent,
  };

  try {
    await sendEmail(mailOptions);
    return res
      .status(200)
      .json({ success: true, message: "Email sent successfully!" });
  } catch (error) {
    console.error("Error sending email:", error);
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to send email.",
        error: error.message,
      });
  }
};

exports.getPaymentHistory = async (req, res) => {
  try {
    const user = req.user; // Get the authenticated user
    const userId = user.role === "superAdmin" ? req.query.userId : user.id; // Determine the userId

    const { page = 1, limit = 5 } = req.query; // Get pagination parameters
    const offset = (page - 1) * limit; // Calculate offset for pagination

    // Fetch all subscriptions associated with the user
    const subscriptions = await model.subscription.findAll({
      where: { userId },
    });

    if (!subscriptions || subscriptions.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No subscriptions found for this user.",
      });
    }

    // Extract subscription IDs
    const subscriptionIds = subscriptions.map(sub => sub.id);

    // Fetch payment histories associated with these subscriptions using pagination
    const paymentHistory = await model.paymentHistory.findAll({
      where: {
        subscriptionId: {
          [Op.in]: subscriptionIds,
        },
      },
      limit: parseInt(limit, 10),
      offset: parseInt(offset, 10),
    });

    // Get the total count of payment histories for pagination
    const totalCount = await model.paymentHistory.count({
      where: {
        subscriptionId: {
          [Op.in]: subscriptionIds,
        },
      },
    });

    // Prepare the response
    const response = {
      success: true,
      message: "Payment history retrieved successfully.",
      data: {
        paymentHistory,
        pagination: {
          totalItems: totalCount,
          totalPages: Math.ceil(totalCount / limit),
          currentPage: parseInt(page, 10),
          limit: parseInt(limit, 10),
        },
      },
    };

    return res.status(200).json(response);
  } catch (error) {
    console.error("Error retrieving payment history:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while retrieving payment history.",
      error: error.message,
    });
  }
};

exports.getOneUser = async (req, res) => {
  try {
    const user = req.user; // Get the authenticated user
    const isUser = req.query.userId;
    let userId = user.role === "superAdmin" ? req.query.userId : user.id; // Determine the userId
    if (req.user.role == "superAdmin" && !req.query.userId) {
      userId = req.user.id;
    }
    const userRole = user.role;
    // Fetch the user from the database
    const foundUser = await model.user.findOne({
      where: { id: userId },
      include: [
        {
          model: model.subscription, // Include related subscription if applicable
          include: [
            {
              model: model.paymentHistory, // Optionally include payment history if needed
            },
          ],
        },
        // Add other associated models if needed
      ],
    });

    // If the user does not exist, return a 404 error
    if (!foundUser) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }
    const business = await model.business.findOne({
      where: {
        userId,
      },
    });
    console.log("business is ", business);
    // Prepare the response data
    let name, photo;

    if (userRole === "superAdmin" && !isUser) {
      name = null;
      photo = foundUser.photoPath;
    }
    else if (userRole === "superAdmin" && isUser) {
      name = business.dataValues.name;
      photo = business.dataValues.photoPath;
    }
    else {
      name = business.dataValues.name;
      photo = business.dataValues.photoPath;
    }

    const userData = {
      id: foundUser.id,
      firstName: foundUser.firstName,
      lastName: foundUser.lastName,
      email: foundUser.email,
      role: foundUser.role,
      createdAt: foundUser.createdAt,
      updatedAt: foundUser.updatedAt,
      subscription: foundUser.subscription, // Include subscription data
      businessName: name,
      businessPhoto: photo,
    };

    // Send the response
    return res.status(200).json({
      success: true,
      message: "User retrieved successfully.",
      data: userData,
    });
  } catch (error) {
    console.error("Error fetching user:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while fetching the user.",
      error: error.message,
    });
  }
};

exports.updateUser = async (req, res) => {
  try {
    let user = req.user; // Authenticated user
    let userId = user.role === "superAdmin" ? req.query.userId : user.id; // Determine the userId
    if (req.user.role === "superAdmin" && !req.query.userId) {

      userId = req.user.id;
    }



    const { firstName, lastName, email, oldPassword, newPassword } = req.body; // Fields to update

    // Find the user to update
    const foundUser = await model.user.findOne({ where: { id: userId } });
    console.log("found user is ", foundUser);

    // If the user does not exist, return 404
    if (!foundUser) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }
    const existingEmail = await model.user.findOne({ where: { email } });
    console.log("existing email is ", existingEmail);

    if (existingEmail && existingEmail.id.toString() !== userId.toString()) {
      return res.status(400).json({
        success: false,
        message: "Email already exists.",
      });
    }
    // Update the user fields if provided
    if (firstName) foundUser.firstName = firstName;
    if (lastName) foundUser.lastName = lastName;
    if (email) foundUser.email = email;

    // Handle password update
    if (newPassword) {
      if (user.role !== "superAdmin") {
        // If not superAdmin, compare oldPassword with the current password
        const isMatch = await bcrypt.compare(oldPassword, foundUser.password);

        if (!isMatch) {
          return res.status(400).json({
            success: false,
            message: "Old password is incorrect.",
          });
        }
      }

      // Hash the new password and update it
      const hashedNewPassword = await bcrypt.hash(newPassword, 10);
      foundUser.password = hashedNewPassword;
    }

    // Save the updated user
    await foundUser.save();

    // Prepare response data
    const updatedUserData = {
      id: foundUser.id,
      firstName: foundUser.firstName,
      lastName: foundUser.lastName,
      email: foundUser.email,
      role: foundUser.role,
      updatedAt: foundUser.updatedAt,
    };

    // Return success response
    return res.status(200).json({
      success: true,
      message: "User updated successfully.",
      data: updatedUserData,
    });
  } catch (error) {
    console.error("Error updating user:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while updating the user.",
      error: error.message,
    });
  }
};
exports.getUserCards = async (req, res) => {
  try {
    let userId = req.user.id;

    if (req.user.role === "superAdmin") {
      userId = req.query.userId;
    }

    let customerData = null;
    try {
      customerData = await model.subscription.findOne({
        where: { userId },
        order: [['createdAt', 'DESC']],
      });
    } catch (err) {
      console.error("Error fetching subscription:", err);
    }

    let plan = null;
    if (customerData) {
      try {
        plan = await model.plan.findOne({
          where: { id: customerData.paymentPlanId },
        });
      } catch (err) {
        console.error("Error fetching plan:", err);
      }
    }

    // Check for cancelRequested
    let business = null;
    try {
      business = await model.business.findOne({ where: { userId } });
      if (business && business.cancelRequested) {
        return res.status(200).json({
          success: true,
          message: "Cancel has been requested. Card info is hidden.",
          data: {
            plan: null,
            customer: null,
            cards: null,
            cancelRequested: true,
          },
        });
      }
    } catch (err) {
      console.error("Error fetching business:", err);
    }

    // Find Stripe customer
    let customer = null;
    try {
      const customers = await stripe.customers.search({
        query: `metadata['user_id']:'${userId}'`,
      });
      if (customers.data.length > 0) {
        customer = customers.data[0];
      }
    } catch (err) {
      console.error("Error searching Stripe customer:", err);
    }

    if (!customer) {
      return res.status(404).json({
        success: false,
        message: "No Stripe customer found for this user.",
      });
    }

    // Retrieve cards
    let cards = [];
    try {
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customer.id,
        type: "card",
      });

      cards = paymentMethods.data.map((paymentMethod) => ({
        brand: paymentMethod.card.brand,
        last4: paymentMethod.card.last4,
        exp_month: paymentMethod.card.exp_month,
        exp_year: paymentMethod.card.exp_year,
        country: paymentMethod.card.country,
        cardholder_name: paymentMethod.billing_details.name,
      }));
    } catch (err) {
      console.error("Error fetching payment methods:", err);
    }

    const customerInfo = {
      name: customer.name,
      email: customer.email,
      country: customer.address?.country || "N/A",
    };

    return res.status(200).json({
      success: true,
      message: "Card data successfully retrieved.",
      data: {
        plan,
        customer: customerInfo,
        cards,
        cancelRequested: false,
      },
    });
  } catch (error) {
    console.error("Unexpected error in getUserCards:", error);
    return res.status(500).json({
      success: false,
      message: "An error occurred while fetching card information.",
      error: error.message,
    });
  }
};



exports.updateCardInfo = async (req, res) => {
  let userId = req.user.id; // Get userId from the request
  const { paymentMethodId } = req.body; // New payment method ID
  if (req.user.role === "superAdmin") {
    userId = req.query.userId;
  }

  console.log("New Payment Method ID:", paymentMethodId);

  if (!paymentMethodId) {
    return res.status(400).json({ error: "Payment method ID is required." });
  }

  try {
    // Step 1: Retrieve the customer using userId from metadata
    const customers = await stripe.customers.search({
      query: `metadata['user_id']:'${userId}'`,
    });

    if (customers.data.length === 0) {
      return res.status(404).json({ error: "Customer not found." });
    }

    const customer = customers.data[0];

    // Step 2: Attach the new payment method to the customer
    await stripe.paymentMethods.attach(paymentMethodId, {
      customer: customer.id,
    });

    // Step 3: Set the new payment method as the default
    await stripe.customers.update(customer.id, {
      invoice_settings: {
        default_payment_method: paymentMethodId,
      },
    });

    // Step 4: Remove the previous payment method (optional)
    const oldPaymentMethod = customer.invoice_settings?.default_payment_method;
    if (oldPaymentMethod && oldPaymentMethod !== paymentMethodId) {
      await stripe.paymentMethods.detach(oldPaymentMethod);
    }

    // Respond with success
    res.status(200).json({
      message: "Payment method updated successfully.",
      customerId: customer.id,
    });
  } catch (error) {
    console.error("Error updating card info:", error);

    // Handle specific Stripe errors
    if (error.type === "StripeInvalidRequestError") {
      return res
        .status(400)
        .json({ error: "Invalid request: " + error.message });
    }

    // Generic error response
    res
      .status(500)
      .json({ error: "An error occurred while updating the card." });
  }
};

exports.changeSubscription = async (req, res) => {
  let userId = req.user.id; // Get userId from the authenticated request
  console.log("user is ", req.user);
  const price = req.query.price; // New price for the subscription
  if (req.user.role === "superAdmin") {
    userId = req.query.userId;
  }

  if (!price) {
    return res
      .status(400)
      .json({ error: "New price is required as a query parameter." });
  }

  try {
    // Step 1: Fetch the new payment plan details
    const paymentPlan = await model.plan.findOne({
      where: { planPrice: price },
    });

    if (!paymentPlan) {
      return res
        .status(404)
        .json({ error: "No plan found for the provided price." });
    }

    const newPriceId = paymentPlan.planId;
    const newPlanId = paymentPlan.id;

    // Step 2: Search for the user's Stripe customer by metadata
    const customers = await stripe.customers.search({
      query: `metadata['user_id']:'${userId}'`,
    });

    if (customers.data.length === 0) {
      return res
        .status(404)
        .json({ error: "No Stripe customer found for the user." });
    }

    const customer = customers.data[0];

    // Step 3: Check for the user's active subscription
    const subscriptions = await stripe.subscriptions.list({
      customer: customer.id,
      status: "active",
      limit: 1,
    });

    if (subscriptions.data.length === 0) {
      return res
        .status(404)
        .json({ error: "No active subscription found for the user." });
    }

    const currentSubscription = subscriptions.data[0];

    // Step 4: Cancel the current subscription
    await stripe.subscriptions.cancel(currentSubscription.id);

    // Step 5: Create a new subscription with the new price
    const newSubscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: newPriceId }],
      expand: ["latest_invoice.payment_intent"],
    });

    // Step 6: Update the subscription details in the database
    await model.subscription.update(
      {
        subscriptionId: newSubscription.id,
        paymentPlanId: newPlanId,
        subscriptionStatus: newSubscription.status, // Update with the new status
      },
      { where: { userId: userId } }
    );

    // Respond with the new subscription details
    res.status(201).json({
      sucess: true,
      message: "Subscription changed successfully!",
      data: {
        customerId: customer.id,
        newPrice: price,
        status: newSubscription.status,
      },
    });
  } catch (error) {
    // Handle specific Stripe errors
    if (error.type === "StripeInvalidRequestError") {
      return res
        .status(400)
        .json({ error: "Invalid request: " + error.message });
    } else if (error.type === "StripeCardError") {
      return res.status(400).json({ error: "Your card was declined." });
    }

    // Generic error response
    console.error("Error while changing subscription:", error);
    res
      .status(500)
      .json({ error: "An error occurred while changing the subscription." });
  }
};


exports.createEmailTemplate = async (req, res) => {
  try {
    const { id, subject, htmlContent, senderName } = req.body;
    let templateId = id;

    // Ensure the user has superAdmin role
    const user = req.user;
    if (user.role !== "superAdmin") {
      return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    let emailTemplate;

    if (templateId) {
      // Update the existing email template
      emailTemplate = await model.emailTemplate.findOne({ where: { id: templateId } });
      if (!emailTemplate) {
        return res.status(404).json({
          success: false,
          message: "Email template not found.",
        });
      }

      await emailTemplate.update({ subject, htmlContent, senderName });
      return res.status(200).json({
        success: true,
        message: "Email template updated successfully.",
        data: emailTemplate,
      });
    }

    // Create a new email template
    const { name } = req.body; // Name is only allowed when creating
    emailTemplate = await model.emailTemplate.create({
      name,
      subject,
      htmlContent,
      senderName,
    });

    res.status(201).json({
      success: true,
      message: "Email template created successfully.",
      data: emailTemplate,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Error creating or updating email template." });
  }
};
exports.sendBusinessEmail = async (req, res) => {
  try {
    const { recipientEmail, recipientName, templateName } = req.body;

    // Validate request data
    if (!recipientEmail || !recipientName || !templateName) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    let user = req.user;

    // Fetch the email template from the database
    const template = await model.emailTemplate.findOne({
      where: { userId: user.id, name: templateName },
    });

    if (!template) {
      return res.status(404).json({ success: false, message: 'Email template not found.' });
    }

    // Replace placeholders in the HTML content with dynamic values
    const htmlContent = template.htmlContent.replace('{{recipientName}}', recipientName);

    // Prepare email options
    const mailOptions = {
      to: recipientEmail,
      subject: template.subject,
      html: htmlContent,
    };

    // Send the email
    const emailResult = await sendEmail(mailOptions);

    // Respond to the client
    res.status(200).json({
      success: true,
      message: 'Email sent successfully.',
      data: { messageId: emailResult.messageId },
    });
  } catch (error) {
    console.error('Error sending email:', error);
    res.status(500).json({ success: false, message: 'Failed to send email.' });
  }
};

exports.getEmailTemplateList = async (req, res) => {
  try {
    // Check user authorization
    const user = req.user;
    if (user.role !== "superAdmin") {
      return res.status(403).json({ success: false, message: "Unauthorized." });
    }

    // Fetch all email templates with only id and name
    const emailTemplates = await model.emailTemplate.findAll();

    res.status(200).json({
      success: true,
      message: "Email templates retrieved successfully.",
      data: emailTemplates,
    });
  } catch (error) {
    console.error("Error fetching email templates:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching email templates.",
    });
  }
};

