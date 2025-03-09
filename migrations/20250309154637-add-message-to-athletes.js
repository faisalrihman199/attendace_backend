'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Athletes', 'message', {
      type: Sequelize.STRING, // or Sequelize.TEXT if you expect longer messages
      allowNull: true,       // Change to false and add defaultValue if needed
      defaultValue: null     // Provide a default value if allowNull is false
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Athletes', 'message');
  }
};
