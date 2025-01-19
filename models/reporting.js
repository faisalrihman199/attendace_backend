const { DataTypes, ValidationError } = require('sequelize');
const sequelize = require('../config/db'); // Import your Sequelize connection

const Reporting = sequelize.define('reporting', {
    reportingEmails: {
        type: DataTypes.BOOLEAN,
        defaultValue: true 
    },
    duration: {
        type: DataTypes.ENUM('weekly', 'monthly'),
        defaultValue: 'weekly' 
    },
    email: {
        type: DataTypes.STRING,
        allowNull: false,
        validate: {
            isEmail: true 
        }
    },
    pinLength: {
        type: DataTypes.STRING,
        allowNull: false
    }
});

module.exports = Reporting;
