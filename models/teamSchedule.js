const { DataTypes } = require('sequelize');
const sequelize = require('../config/db'); // Adjust path if needed

const TeamSchedule = sequelize.define('teamSchedule', {
  dayOfWeek: {
    type: DataTypes.ENUM(
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday'
    ),
    allowNull: false,
  },
  startTime: {
    type: DataTypes.TIME,
    allowNull: false,
  },
  endTime: {
    type: DataTypes.TIME,
    allowNull: false,
  },
  athleteGroupId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    field: 'athleteGroupId',
    references: {
      model: 'athleteGroups', // must match DB table name
      key: 'id'
    },
    onDelete: 'CASCADE'
  }
}, {
  tableName: 'teamSchedules', 
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['athleteGroupId', 'dayOfWeek']
    }
  ]
});

module.exports = TeamSchedule;
