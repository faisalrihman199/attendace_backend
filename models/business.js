const { DataTypes } = require('sequelize');
const sequelize = require('../config/db'); // Import your Sequelize connection

const Business = sequelize.define('business', {
    name: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true
    },
    message: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    photoPath: {
        type: DataTypes.STRING,
        allowNull: true
    },
    status: { // New status column
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'active' // Set default value
    },
    timezone: {
        type: DataTypes.STRING,
        allowNull: true, // Set to false if the timezone is required
        defaultValue: 'UTC', // Optional default value
    },
    trialPaid: { // Add the new column
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
    },
}, 
{
    
    timestamps: true, // Ensure createdAt and updatedAt fields are added
});

module.exports = Business;
