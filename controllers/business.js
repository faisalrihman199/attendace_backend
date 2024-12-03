// Function to add or update a business

const model = require("../models")
const bcrypt = require("bcrypt")
const fs = require('fs');
const path = require('path');
const Sequelize = require("sequelize")
const sequelize  = require("../config/db");
const { Op } = require("sequelize");
const { log } = require("console");

require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET);
function getRandomNumber() {
    return Math.floor(Math.random() * 5) + 3;
  }

  exports.addBusiness = async (req, res) => {
    const transaction = await sequelize.transaction(); // Start a transaction
    try {
        const user = req.user;
        const { firstName, lastName, email, password } = req.body;
        const { id } = req.query; // Get the ID from the request parameters

        // Check if the email already exists, including soft-deleted users
        const existingUser = await model.user.findOne({
            where: { email },
            paranoid: false, // Include soft-deleted records
        });

        if (id) {
            // If ID is present, update the user
            const userToUpdate = await model.user.findByPk(id);

            if (!userToUpdate) {
                return res.status(404).json({ message: "User not found." });
            }

            // Hash the new password if provided
            const hashedPassword = password
                ? await bcrypt.hash(password, 10)
                : userToUpdate.password;

            // Update user data, but do not change the role
            await model.user.update(
                {
                    firstName,
                    lastName,
                    password: hashedPassword,
                },
                { where: { id }, transaction }
            );

            await transaction.commit();
            return res.status(200).json({ message: "User updated successfully." });
        } else {
            // If ID is not present, handle email logic
            if (existingUser) {
                if (existingUser.deletedAt) {
                    // Restore the soft-deleted user
                    await existingUser.restore({ transaction });

                    // Update the restored user's details
                    await existingUser.update(
                        {
                            firstName,
                            lastName,
                            password: await bcrypt.hash(password, 10),
                        },
                        { transaction }
                    );

                    await transaction.commit();
                    return res.status(200).json({
                        success: true,
                        message: "User restored and updated successfully.",
                    });
                } else {
                    return res.status(400).json({
                        success: false,
                        message: "Email already exists and is active.",
                    });
                }
            }

            // If no user exists, create a new one
            const hashedPassword = await bcrypt.hash(password, 10);

            const newUser = await model.user.create(
                {
                    firstName,
                    lastName,
                    email,
                    password: hashedPassword,
                    role: "admin", // Set role to admin as specified
                },
                { transaction }
            );

            await transaction.commit();
            return res.status(201).json({
                success: true,
                message: "User created successfully.",
                newUser,
            });
        }
    } catch (error) {
        // Rollback the transaction in case of error
        if (transaction) await transaction.rollback();
        console.error("Error adding or updating user:", error);
        return res.status(500).json({ success: false, message: "An error occurred.", error });
    }
};


exports.getOneBusiness = async (req, res) => {
    try {
        const user = req.user; // Get the authenticated user

        // Find the business linked to the authenticated user's ID
        const business = await model.business.findOne({
            where: {
                userId: user.id
            }
        });

        // If the business does not exist, return a 404 response
        if (!business) {
            return res.status(404).json({
                success: false,
                message: 'No business found for this user.',
            });
        }

        // Return the business details
        return res.status(200).json({
            success: true,
            message: 'Business retrieved successfully.',
            data: business,
        });

    } catch (error) {
        console.error('Error fetching business:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while retrieving the business.',
            error: error.message,
        });
    }
};



exports.getAllBusinesses = async (req, res) => {
    try {
        const user = req.user; // Get the authenticated user
        console.log("user role is ", user.role);

        const searchQuery = req.query.search || ''; // Get the search query parameter
        const userId = req.query.userId; // Get the userId from query parameters
        const page = parseInt(req.query.page) || 1; // Default to page 1
        const limit = parseInt(req.query.limit) || 6; // Default to 6 items per page
        const offset = (page - 1) * limit;

        // Define search filter for the name field
        const nameFilter = searchQuery
        ? { name: { [Sequelize.Op.like]: `%${searchQuery}%` } } // Matches any part of the name
        : {};
    
        // SuperAdmin logic
        if (user.role === 'superAdmin') {
            if (userId) {
                const businesses = await model.business.findAll({
                    where: { 
                        ...nameFilter,
                        userId: userId 
                    }, // Filter by name and userId
                    include: [
                        {
                            model: model.user,
                            as: 'user',
                            attributes: ['firstName', 'lastName', 'id'],
                        },
                        {
                            model: model.reporting,
                            as: 'reporting',
                            attributes: ['pinLength'],
                        },
                    ],
                });

                if (businesses.length === 0) {
                    return res.status(404).json({
                        success: false,
                        message: 'No businesses found for this user.',
                    });
                }

                const businessesWithOwnerName = businesses.map(business => ({
                    id: business.id,
                    name: business.name,
                    message: business.message,
                    photoPath: business.photoPath,
                    ownerName: `${business.user.firstName || ''} ${business.user.lastName || ''}`.trim(),
                    status: business.status,
                    userId: business.user.id,
                    pinLength: business.reporting.pinLength,
                }));

                return res.status(200).json({
                    success: true,
                    message: 'Businesses for the specified user retrieved successfully.',
                    data: businessesWithOwnerName,
                });
            }

            // If no userId is provided, fetch all businesses with pagination
            const { count, rows: businesses } = await model.business.findAndCountAll({
                where: nameFilter, // Apply name filter
                include: [
                    {
                        model: model.user,
                        as: 'user',
                        attributes: ['firstName', 'lastName', 'id'],
                    },
                    {
                        model: model.reporting,
                        as: 'reporting',
                        attributes: ['pinLength'],
                    },
                ],
                offset,
                limit,
            });

            if (count === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'No businesses found.',
                });
            }

            const businessesWithOwnerName = businesses.map(business => ({
                id: business.id,
                name: business.name,
                message: business.message,
                photoPath: business.photoPath,
                ownerName: `${business.user.firstName || ''} ${business.user.lastName || ''}`.trim(),
                status: business.status,
                userId: business.user.id,
                pinLength: business.reporting.pinLength,
            }));

            return res.status(200).json({
                success: true,
                message: 'All businesses retrieved successfully.',
                data: {
                    totalItems: count,
                    currentPage: page,
                    totalPages: Math.ceil(count / limit),
                    businesses: businessesWithOwnerName,
                },
            });
        }

        // Admin logic
        if (user.role === 'admin') {
            const businesses = await model.business.findAll({
                where: {
                    ...nameFilter,
                    userId: user.id,
                }, // Filter by name and userId
                include: [
                    {
                        model: model.user,
                        as: 'user',
                        attributes: ['firstName', 'lastName', 'id'],
                    },
                    {
                        model: model.reporting,
                        as: 'reporting',
                        attributes: ['pinLength'],
                    },
                ],
            });

            if (businesses.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'No businesses found for this admin.',
                });
            }

            const businessesWithOwnerName = businesses.map(business => ({
                id: business.id,
                name: business.name,
                message: business.message,
                photoPath: business.photoPath,
                ownerName: `${business.user.firstName || ''} ${business.user.lastName || ''}`.trim(),
                status: business.status,
                userId: business.user.id,
                pinLength: business.reporting.pinLength,
            }));

            return res.status(200).json({
                success: true,
                message: 'Businesses retrieved successfully for admin.',
                data: businessesWithOwnerName,
            });
        }

        // Non-superAdmin, non-admin logic
        const businesses = await model.business.findAll({
            where: {
                ...nameFilter,
                userId: user.id,
            },
            include: [
                {
                    model: model.user,
                    as: 'user',
                    attributes: ['firstName', 'lastName', 'id'],
                },
            ],
        });

        if (businesses.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'No businesses found for this user.',
            });
        }

        const businessesWithOwnerName = businesses.map(business => ({
            id: business.id,
            name: business.name,
            message: business.message,
            photoPath: business.photoPath,
            ownerName: `${business.user.firstName || ''} ${business.user.lastName || ''}`.trim(),
            status: business.status,
            userId: business.user.id,
        }));

        return res.status(200).json({
            success: true,
            message: 'Your businesses retrieved successfully.',
            data: businessesWithOwnerName,
        });
    } catch (error) {
        console.error('Error fetching businesses:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while retrieving businesses.',
            error: error.message,
        });
    }
};



exports.addAthleteGroup = async (req, res) => {
    try {
        const user = req.user; // Get the authenticated user
        const userId = user.role === 'superAdmin' ? req.query.userId : user.id; // Determine userId

        // Assuming you have a method to get the businessId based on the userId
        const business = await model.business.findOne({ where: { userId } });

        if (!business) {
            return res.status(404).json({
                success: false,
                message: 'Business not found for the provided user.',
            });
        }

        const { groupName, category } = req.body;

        // Check if the request is for updating an existing athlete group
        if (req.query.id) {
            const athleteGroup = await model.AthleteGroup.findOne({
                where: {
                    id: req.query.id,
                    businessId: business.id, // Ensure it's the same business
                    
                }
            });

            if (!athleteGroup) {
                return res.status(404).json({
                    success: false,
                    message: 'Athlete group not found.',
                });
            }

            // Check if the new groupName already exists for this business, excluding the current athlete group
            const existingGroup = await model.AthleteGroup.findOne({
                where: {
                    groupName,
                    businessId: business.id,
                    category:category,
                    id: { [Sequelize.Op.ne]: req.query.id } // Exclude the current group
                }
            });

            if (existingGroup) {
                return res.status(200).json({
                    success: false,
                    message: 'Athlete group name already exists ',
                });
            }

            // Update the existing athlete group
            athleteGroup.groupName = groupName;
            athleteGroup.category = category || athleteGroup.category; // Update category only if provided
            await athleteGroup.save();

            return res.status(200).json({
                success: true,
                message: 'Athlete group updated successfully.',
                data: athleteGroup,
            });
        } else {
            // Create a new athlete group
            const existingGroup = await model.AthleteGroup.findOne({
                where: {
                    groupName,
                    businessId: business.id ,
                    category
                }
            });

            if (existingGroup) {
                return res.status(200).json({
                    success: false,
                    message: 'Athlete group name already exists.',
                });
            }

            const newAthleteGroup = await model.AthleteGroup.create({
                groupName,
                category,
                businessId: business.id // Use the appropriate businessId
            });

            return res.status(201).json({
                success: true,
                message: 'Athlete group created successfully.',
                data: newAthleteGroup,
            });
        }
    } catch (error) {
        console.error('Error creating or updating athlete group:', error);
        return res.status(500).json({
            success: false,
            message: 'Error creating or updating athlete group',
            error: error.message,
        });
    }
};




exports.createBusiness = async (req, res) => {
    try {
        const user = req.user;
        const { name, message } = req.body;
        const { pinLength } = req.body;
        const userId = user.role === "superAdmin" ? req.query.userId : user.id; // Use userId from query if superAdmin
        const photoPath = req.file ? `business/${req.file.filename}` : null; // New photo path if uploaded
        const pin = pinLength ? pinLength : getRandomNumber();

        const userData = await model.user.findByPk(userId);

        // Check if the user already has a soft-deleted business
        let business = await model.business.findOne({
            where: {
                userId: userId,
            },
            paranoid: false, // Include soft-deleted records
        });

        if (business) {
            // If the business is soft-deleted, restore it
            if (business.deletedAt) {
                await business.restore();
                business.deletedAt = null;
            }

            // If a new photo is uploaded, remove the old one
            if (photoPath && business.photoPath) {
                const oldPhotoPath = path.join(__dirname, "../public", business.photoPath);
                if (fs.existsSync(oldPhotoPath)) {
                    fs.unlinkSync(oldPhotoPath); // Remove the old image
                }
            }

            // Update restored business details (exclude email)
            business.name = name || business.name;
            business.message = message || business.message;
            business.photoPath = photoPath || business.photoPath;

            await business.save();

            // Update reporting settings
            let setting = await model.reporting.findOne({
                where: { businessId: business.id },
            });

            if (!setting) {
                // If no reporting settings exist, create them
                setting = await model.reporting.create({
                    email: userData.email, // Keep email unchanged
                    businessId: business.id,
                    pinLength: pin,
                });
            } else {
                setting.pinLength = pinLength || setting.pinLength;
                await setting.save();
            }

            return res.status(200).json({
                success: true,
                message: "business updated successfully",
                data: business,
                reporting: setting,
            });
        }

        // If no business exists (soft-deleted or not), create a new one
        const newBusiness = await model.business.create({
            name,
            message,
            photoPath,
            userId: userId,
        });

        const reporting = await model.reporting.create({
            email: userData.email,
            businessId: newBusiness.id,
            pinLength: pin,
        });

        return res.status(201).json({
            success: true,
            message: "Business created successfully",
            data: newBusiness,
            reporting: reporting,
        });
    } catch (error) {
        // Check if the error is related to unique constraint violation
        if (error.name === "SequelizeUniqueConstraintError") {
            return res.status(400).json({
                success: false,
                message: "Business name must be unique. This name is already in use.",
            });
        }

        console.error(error);
        return res.status(500).json({
            success: false,
            message: "Error creating or updating business",
            error: error.message,
        });
    }
};



exports.deleteBusiness = async (req, res) => {
    const transaction = await sequelize.transaction(); // Start a transaction
    try {
        const user = req.user; // Authenticated user from middleware

        // Check if the user is a superAdmin
        if (user.role !== 'superAdmin') {
            return res.status(403).json({
                success: false,
                message: 'Only superAdmin users are authorized to delete businesses.',
            });
        }

        const { businessId } = req.params; // Get the business ID from the request parameters

        // Check if the business exists
        const business = await model.business.findOne({
            where: { id: businessId },
            include: [{ model: model.user }],
            transaction, // Use the transaction
        });

        if (!business) {
            await transaction.rollback(); // Roll back the transaction
            return res.status(404).json({
                success: false,
                message: 'Business not found.',
            });
        }

        const businessUser = business.user; // Get the associated user
        if (!businessUser) {
            await transaction.rollback(); // Roll back the transaction
            return res.status(404).json({
                success: false,
                message: 'No user is associated with this business.',
            });
        }

        // Step 1: Fetch the Stripe customer using user metadata
        let stripeCustomerId;
        const customers = await stripe.customers.search({
            query: `metadata['user_id']:'${businessUser.id}'`,
        });

        if (customers.data.length > 0) {
            stripeCustomerId = customers.data[0].id;
        } else {
            stripeCustomerId = null; // If no customer is found, proceed without deleting
        }

        // Step 2: Check if there is an active subscription for the user
        const subscription = await model.subscription.findOne({
            where: { userId: businessUser.id, subscriptionStatus: 'active' },
            transaction, // Use the transaction
        });

        let canceledSubscription;
        if (subscription) {
            // If the subscription exists, cancel it with Stripe
            try {
                canceledSubscription = await stripe.subscriptions.cancel(subscription.subscriptionId); // Cancel subscription with Stripe
            } catch (stripeError) {
                await transaction.rollback(); // Roll back the transaction
                return res.status(500).json({
                    success: false,
                    message: 'Error occurred while canceling the subscription in Stripe.',
                    error: stripeError.message,
                });
            }

            // Step 3: Update the subscription status in the database
            await model.subscription.destroy(
                
                { where: { subscriptionId: subscription.subscriptionId }, transaction } // Use the transaction
            );
        }

        // Step 4: Delete the Stripe customer
        if (stripeCustomerId) {
            try {
                await stripe.customers.del(stripeCustomerId); // Delete the customer from Stripe
            } catch (stripeError) {
                await transaction.rollback(); // Roll back the transaction
                return res.status(500).json({
                    success: false,
                    message: 'Error occurred while deleting the customer in Stripe.',
                    error: stripeError.message,
                });
            }
        }

        // Step 5: Proceed with deletion of the business and associated data
        // Soft delete the user
        await businessUser.destroy({ transaction }); // Use the transaction

        // Soft delete the business
        await business.destroy({ transaction }); // Use the transaction

        // Soft delete related athlete groups
        await model.AthleteGroup.update(
            { deletedAt: new Date() },
            { where: { businessId: businessId }, transaction } // Use the transaction
        );

        await transaction.commit(); // Commit the transaction

        return res.status(200).json({
            success: true,
            message: 'Business deleted successfully.',
        });
    } catch (error) {
        if (transaction) await transaction.rollback(); // Roll back the transaction on error
        console.error('Error deleting business:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while deleting the business.',
            error: error.message,
        });
    }
};



exports.deleteAthleteGroup = async (req, res) => {
    try {
        const user = req.user; // Authenticated user
        const { id } = req.params; // Get athlete group ID from request parameters

        

        // Find the athlete group by ID
        const athleteGroup = await model.AthleteGroup.findOne({
            where: { id },
            include: [{
                model: model.business,
                attributes: ['userId'] // Get userId from the associated business
            }]
        });

        // Check if the athlete group exists
        if (!athleteGroup) {
            return res.status(404).json({
                success: false,
                message: "Athlete group not found."
            });
        }

        console.log(athleteGroup.business.userId)
        // Check if the athlete group's business belongs to the authenticated user
        if (athleteGroup.business.userId !== user.id && req.user.role !="superAdmin") {
            return res.status(403).json({
                success: false,
                message: "You are not authorized to delete this athlete group."
            });
        }

        // Delete the athlete group (soft delete if paranoid is true)
        await athleteGroup.destroy();

        return res.status(200).json({
            success: true,
            message: "Athlete group deleted successfully."
        });
    } catch (error) {
        console.error("Error deleting athlete group:", error);
        return res.status(500).json({
            success: false,
            message: "An error occurred while deleting the athlete group.",
            error: error.message,
        });
    }
};


exports.setBusinessStatusInactive = async (req, res) => {
    try {
        // Check if the user is a superAdmin
        if (req.user.role !== 'superAdmin') {
            return res.status(403).json({ success: false, message: "Only superAdmin can set business status." });
        }

        const { id } = req.params; // Get the business ID from the route parameters

        // Find the business by ID
        const business = await model.business.findByPk(id);

        // Check if the business exists
        if (!business) {
            return res.status(404).json({ success: false, message: 'Business not found.' });
        }

        // Toggle the business status
        business.status = business.status === 'active' ? 'inactive' : 'active';
        await business.save();

        return res.status(200).json({
            success: true,
            message: `Business status set to ${business.status} successfully.`,
            data: business,
        });
    } catch (error) {
        console.error(error);
        return res.status(500).json({
            success: false,
            message: 'Error updating business status.',
            error: error.message,
        });
    }
};


exports.getAthleteGroupsByCategory = async (req, res) => {
    try {

        const user = req.user; // Get the authenticated user from the request
        let userId = user.id; // Get the user ID
        if(user.role === "superAdmin"){
            userId = req.query.userId;
        }

        // Find the business associated with the user
        const business = await model.business.findOne({
            where: {
                userId
            }
        });
        console.log("business is ",business);
        
        const reporting = await model.reporting.findOne({
            where: {
                businessId: business.id 
            }
        })
        const pinLength = reporting.pinLength;
        

        // If no business is found, return an error
        if (!business) {
            return res.status(404).json({
                success: false,
                message: "No business found for this user."
            });
        }

        // Fetch athlete groups based on the business ID
        const athleteGroups = await model.AthleteGroup.findAll({
            where: {
                businessId: business.id // Get groups associated with the user's business
            }
        });

        // Initialize the response objects for teams and classes
        const response = {
            teams: [],
            classes: []
        };

        // Categorize athlete groups into teams and classes
        athleteGroups.forEach(group => {
            if (group.category === 'team') {
                response.teams.push(group); // Add to teams array
            } else if (group.category === 'class') {
                response.classes.push(group); // Add to classes array
            }
        });

        // Return the categorized athlete groups
        return res.status(200).json({
            success: true,
            message: 'Athlete groups retrieved successfully.',
            data: response ,// Return the categorized data
            pinLength:reporting.pinLength
        });
    } catch (error) {
        console.error("Error retrieving athlete groups:", error);
        return res.status(500).json({
            success: false,
            message: "An error occurred while retrieving athlete groups.",
            error: error.message
        });
    }
};



exports.createUser = async (req, res) => {
    const transaction = await sequelize.transaction(); // Start a transaction
    try {
        const user = req.user; // Authenticated user (superAdmin)

        // Check if the authenticated user is a superAdmin
        if (user.role !== "superAdmin") {
            return res.status(403).json({
                success: false,
                message: "Only superAdmin can create a user.",
            });
        }

        // Extract necessary data for creating the new user from the request body
        const { firstName, lastName, email, password } = req.body;

        // Validate that all required fields are provided
        if (!firstName || !lastName || !email || !password) {
            return res.status(400).json({
                success: false,
                message:
                    "Please provide all required fields: firstName, lastName, email, and password.",
            });
        }

        // Check if a user with the given email already exists, including soft-deleted users
        const existingUser = await model.user.findOne({
            where: { email },
            paranoid: false, // Include soft-deleted records
        });

        if (existingUser) {
            if (existingUser.deletedAt) {
                // If the user is soft-deleted, restore the user
                await existingUser.restore({ transaction });

                // Update the restored user's details
                await existingUser.update(
                    {
                        firstName,
                        lastName,
                        password: await bcrypt.hash(password, 10), // Hash the new password
                        role: "admin", // Ensure the role is set to "admin"
                    },
                    { transaction }
                );

                await transaction.commit();
                return res.status(200).json({
                    success: true,
                    message: "User restored and updated successfully.",
                    data: {
                        id: existingUser.id,
                        firstName: existingUser.firstName,
                        lastName: existingUser.lastName,
                        email: existingUser.email,
                        role: existingUser.role,
                    },
                });
            } else {
                return res.status(409).json({
                    success: false,
                    message: "A user with this email already exists.",
                    userId: existingUser.id,
                });
            }
        }

        // Hash the password before saving it
        const hashedPassword = await bcrypt.hash(password, 10); // 10 is the salt rounds

        // Create a new user record
        const newUser = await model.user.create(
            {
                firstName,
                lastName,
                email,
                password: hashedPassword, // Save the hashed password
                role: "admin",
            },
            { transaction }
        );

        await transaction.commit();
        // Return a success response with the newly created user (excluding sensitive info)
        return res.status(201).json({
            success: true,
            message: "User created successfully.",
            data: {
                id: newUser.id,
                firstName: newUser.firstName,
                lastName: newUser.lastName,
                email: newUser.email,
                role: newUser.role,
            },
        });
    } catch (error) {
        if (transaction) await transaction.rollback(); // Rollback the transaction in case of an error
        console.error("Error creating user:", error);
        return res.status(500).json({
            success: false,
            message: "An error occurred while creating the user.",
            error: error.message,
        });
    }
};

exports.getAllAthleteGroups = async (req, res) => {
    try {
        const user = req.user; // Get the authenticated user
        const userId = user.role === 'superAdmin' ? req.query.userId : user.id; // Determine the userId

        const { page = 1, limit = 10, name } = req.query; // Get pagination and name filter parameters
        const offset = (page - 1) * limit; // Calculate offset for pagination

        // Find the business associated with the userId
        const business = await model.business.findOne({ where: { userId } });

        const reporting = await model.reporting.findOne({ where: { businessId: business.id } });
        console.log("reporting is ",reporting)

        if (!business) {
            return res.status(404).json({ success: false, message: 'Business not found for the provided user.' });
        }

        // Build the where clause for the query
        const whereClause = { businessId: business.id };

        // Add name filtering if the name is provided
        if (name) {
            whereClause.groupName = { [Op.like]: `%${name}%` }; // Use contains-like query
        }

        // Fetch athlete groups associated with the business with pagination and exclude unwanted fields
        const athleteGroups = await model.AthleteGroup.findAndCountAll({
            where: whereClause,
            attributes: { exclude: ['createdAt', 'updatedAt', 'deletedAt'] }, // Exclude specified fields
            limit: parseInt(limit, 10), // Convert limit to integer
            offset: parseInt(offset, 10), // Convert offset to integer
        });

        // Prepare the response
        const response = {
            success: true,
            message: 'Athlete groups retrieved successfully.',
            data: {
                AtheleteGroups: athleteGroups.rows, // The array of athlete groups
                totalItems: athleteGroups.count, // Total number of items
                totalPages: Math.ceil(athleteGroups.count / limit), // Calculate total pages
                currentPage: parseInt(page, 10), // Current page number
            },
            pinLength: reporting.pinLength
        };

        return res.status(200).json(response);
    } catch (error) {
        console.error('Error retrieving athlete groups:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while retrieving athlete groups.',
            error: error.message,
        });
    }
};


exports.getOneReporting = async (req, res) => {
    try {
        const user = req.user;
        const userId = user.role === "superAdmin" ? req.query.userId : user.id; // Use userId from query if superAdmin, otherwise current user
        const business = await model.business.findOne({
            where:{
                userId:userId
            }
        })
        // Find the reporting entry based on userId
        const reporting = await model.reporting.findOne({
            where: {
                businessId: business.id // Ensure you have a userId field in the Reporting model
            }
        });

        if (!reporting) {
            return res.status(404).json({
                success: false,
                message: 'Reporting entry not found for the provided user.'
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Reporting entry retrieved successfully.',
            data: reporting
        });
    } catch (error) {
        console.error('Error retrieving reporting entry:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while retrieving the reporting entry.',
            error: error.message
        });
    }
};

exports.updateReporting = async (req, res) => {
    try {
        const user = req.user;
        const userId = user.role === "superAdmin" ? req.query.userId : user.id; // Use userId from query if superAdmin, otherwise current user
        
        // Find the business associated with the userId
        const business = await model.business.findOne({
            where: { userId: userId }
        });

        if (!business) {
            return res.status(404).json({
                success: false,
                message: 'Business not found for the provided user.'
            });
        }

        // Find the reporting entry based on businessId
        const reporting = await model.reporting.findOne({
            where: { businessId: business.id }
        });

        if (!reporting) {
            return res.status(404).json({
                success: false,
                message: 'Reporting entry not found for the provided business.'
            });
        }

        // Update the reporting entry with the provided data
        const updatedReporting = await reporting.update({
            reportingEmails: req.body.reportingEmails || reporting.reportingEmails,
            duration: req.body.duration || reporting.duration,
            email: req.body.email || reporting.email
        });

        return res.status(200).json({
            success: true,
            message: 'Reporting entry updated successfully.',
            data: updatedReporting
        });
    } catch (error) {
        console.error('Error updating reporting entry:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while updating the reporting entry.',
            error: error.message
        });
    }
};


exports.getBusinessNameandPhoto=async(req,res)=>{
    try{
        const name = req.body.name
        const business = await model.business.findOne({where:{name:name}})
        if(!business){
            return res.status(404).json({
                success: false,
                message: 'Business not found for the provided name.'
            });
        }
        return res.status(200).json({
            success: true,
            message:"business details fetched successfully",
            data:{
              name:business.name,
              message:business.message,
              photo:business.photoPath
            }
            
        });

    }catch(error){
        console.error('Error fetching business:', error);
        return res.status(500).json({
            success: false,
            message: 'An error occurred while retrieving the business.',
            error: error.message,
        });
    }
}




exports.getBusinessStatistics = async (req, res) => {
    try {
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
  
      // Fetch all athlete groups for the business
      const athleteGroups = await model.AthleteGroup.findAll({
        where: { businessId: business.id },
        include: [{ model: model.Athlete }],
      });
  
      // Get current year
      const currentYear = new Date().getFullYear();
  
      // Structure to store the result
      const athleteGroupLogins = {};
  
      // Loop through each athlete group
      for (const group of athleteGroups) {
        const groupName = group.groupName;
  
        // Fetch the logins (check-ins) for athletes in this group for the current year, grouped by month
        const loginsPerMonth = await model.checkin.findAll({
          attributes: [
            [sequelize.fn("MONTH", sequelize.col("createdAt")), "month"],
            [sequelize.fn("COUNT", sequelize.col("id")), "totalLogins"],
          ],
          where: {
            athleteId: {
              [Op.in]: group.Athletes.map((athlete) => athlete.id), // Filter by athlete IDs in this group
            },
            createdAt: {
              [Op.between]: [`${currentYear}-01-01`, `${currentYear}-12-31`], // Restrict to current year
            },
          },
          group: [sequelize.fn("MONTH", sequelize.col("createdAt"))],
        });
  
        // Initialize month-wise data for this group with 0 logins
        const monthlyData = Array.from({ length: 12 }, (_, index) => ({
          name: new Date(currentYear, index).toLocaleString("default", { month: "short" }),
          value: 0, // Initialize login count to 0
        }));
  
        // Update the monthlyData array with the actual logins for the months where logins exist
        loginsPerMonth.forEach((login) => {
          const monthIndex = login.getDataValue("month") - 1; // Convert month to 0-based index
          monthlyData[monthIndex].value = login.getDataValue("totalLogins");
        });
  
        // Add this group data to the final result
        athleteGroupLogins[groupName] = monthlyData;
      }
  
      // Fetch the total logins (check-ins) for the entire business, grouped by month for the current year
      const allAthletes = await model.Athlete.findAll({
        attributes: ['id'],
        include: [{
          model: model.AthleteGroup,
          where: { businessId: business.id },
          required: true // Ensures only athletes in groups linked to the business are counted
        }],
      });
  
      const totalLoginsPerMonth = await model.checkin.findAll({
        attributes: [
          [sequelize.fn("MONTH", sequelize.col("createdAt")), "month"],
          [sequelize.fn("COUNT", sequelize.col("id")), "totalLogins"],
        ],
        where: {
          createdAt: {
            [Op.between]: [`${currentYear}-01-01`, `${currentYear}-12-31`], // Restrict to current year
          },
          athleteId: {
            [Op.in]: allAthletes.map(athlete => athlete.id), // Get all athlete IDs linked to this business
          },
        },
        group: [sequelize.fn("MONTH", sequelize.col("createdAt"))],
      });
  
      // Initialize month-wise total data for the business with 0 logins
      const businessTotalLogins = Array.from({ length: 12 }, (_, index) => ({
        name: new Date(currentYear, index).toLocaleString("default", { month: "short" }),
        value: 0, // Initialize login count to 0
      }));
  
      // Update the total login data for the months where logins exist
      totalLoginsPerMonth.forEach((login) => {
        const monthIndex = login.getDataValue("month") - 1; // Convert month to 0-based index
        businessTotalLogins[monthIndex].value = login.getDataValue("totalLogins");
      });
  
      // Fetch the last 3 logins for the business
      const last3Logins = await model.checkin.findAll({
        where: {
          athleteId: {
            [Op.in]: allAthletes.map(athlete => athlete.id),
          },
        },
        order: [['createdAt', 'DESC']], // Order by the most recent
        limit: 3, // Limit to 3 logins
        include: [
          {
            model: model.Athlete,
            attributes: ['name'], // Include only the athlete's name
          },
        ],
      });
  
      // Total number of athlete groups and total number of athletes
      const totalAthleteGroups = athleteGroups.length;
      const totalAthletes = allAthletes.length;
  
      return res.status(200).json({
        success: true,
        message: "Business statistics fetched successfully.",
        data: {
          athleteGroups: athleteGroupLogins,
          totalBusinessLoginsPerMonth: businessTotalLogins, // Include month-wise total check-ins for the business
          totalAthleteGroups, // Include total athlete groups
          totalAthletes, // Include total number of athletes
          last3Logins, // Include last 3 logins
          businessName: business.name,
          businessId:business.id
        },
      });
    } catch (error) {
      console.error("Error fetching business statistics:", error);
      return res.status(500).json({
        success: false,
        message: "An error occurred while fetching business statistics.",
        error: error.message,
      });
    }
  };
  