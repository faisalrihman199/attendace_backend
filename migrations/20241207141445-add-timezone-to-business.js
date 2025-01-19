'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    // Add the 'timezone' column to the 'Businesses' table
    await queryInterface.addColumn('businesses', 'timezone', {
      type: Sequelize.STRING,
      allowNull: true, // Allow null values for timezone
      defaultValue: 'UTC', // Default timezone to UTC
    });
  },

  async down(queryInterface, Sequelize) {
    // Remove the 'timezone' column from the 'Businesses' table
    await queryInterface.removeColumn('businesses', 'timezone');
  },
};
