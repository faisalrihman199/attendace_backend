
const { DataTypes } = require('sequelize');
const sequelize = require('../config/db'); // Adjust the path based on your setup

const AthleteGroup = sequelize.define('athleteGroup', {
    groupName: {
        type: DataTypes.STRING,
        allowNull: false,
        
    },
    category: {
        type: DataTypes.ENUM('class', 'team'), // Define enum to restrict values to 'class' or 'team'
        allowNull: false,
    }
},
{
    // Enable paranoid mode for soft deletes
    paranoid: true, 
    timestamps: true, // Ensure createdAt and updatedAt fields are added
}
);

module.exports = AthleteGroup;
