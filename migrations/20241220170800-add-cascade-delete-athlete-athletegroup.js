'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create AthleteAthleteGroups table
    await queryInterface.createTable('AthleteAthleteGroups', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true,
        allowNull: false,
      },
      athleteId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'Athletes', // Name of the athlete table
          key: 'id',
        },
        onDelete: 'CASCADE', // Delete from junction table when athlete is deleted
        onUpdate: 'CASCADE', // Update in junction table when athlete ID changes
      },
      athleteGroupId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'AthleteGroups', // Name of the athlete group table
          key: 'id',
        },
        onDelete: 'CASCADE', // Delete from junction table when athlete group is deleted
        onUpdate: 'CASCADE', // Update in junction table when athlete group ID changes
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });
  },

  down: async (queryInterface, Sequelize) => {
    // Drop AthleteAthleteGroups table
    await queryInterface.dropTable('AthleteAthleteGroups');
  },
};
