const { DataTypes } = require('sequelize');
const sequelize = require('../config/db'); // Your sequelize instance


// Define the CheckIn model
const CheckIn = sequelize.define('checkIn', {

   checkinDate:{
       type: DataTypes.DATE,
   },
   checkinTime:{
       type: DataTypes.TIME,
   }
}, {
    timestamps: true, // Automatically adds createdAt and updatedAt fields
    updatedAt: false, // Disable updatedAt since we only need createdAt to track the check-in time
});


module.exports = CheckIn;
