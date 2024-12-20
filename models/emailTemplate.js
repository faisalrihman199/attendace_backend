const sequelize = require('../config/db');
const { DataTypes } = require('sequelize');
const user = require('./user');

const EmailTemplate = sequelize.define('emailTemplate', {
    name: {
      type: DataTypes.STRING,
      allowNull: false,
      
    },
    subject: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    htmlContent: {
      type: DataTypes.TEXT,  // Store the HTML content as text
      allowNull: false,
    },
    senderName: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'Attendace'
    },
    
  });
  
  module.exports = EmailTemplate;