const { DataTypes } = require('sequelize');
const sequelize = require('../config/db'); // Adjust the path as necessary

const Athlete = sequelize.define('Athlete', {
  pin: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  dateOfBirth: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: true,   // fix typo: was allownull
  },
  active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  photoPath: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  message: {
    type: DataTypes.TEXT,
    allowNull: true,
  },

  // NEW: store array like ["email","check-in"]
  messageShown: {
    type: DataTypes.JSON,      
    allowNull: true,           
    defaultValue: [],          
   
  },
});

module.exports = Athlete;
