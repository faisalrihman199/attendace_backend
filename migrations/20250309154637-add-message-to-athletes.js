'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Athletes', 'message', {
      type: Sequelize.STRING,
      allowNull: true,       
      defaultValue: null     
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('Athletes', 'message');
  }
};
