'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('businesses', 'message', {
      type: Sequelize.TEXT,
      allowNull: true, // Change allowNull to true
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('businesses', 'message', {
      type: Sequelize.TEXT,
      allowNull: false, // Revert allowNull to false
    });
  }
};
