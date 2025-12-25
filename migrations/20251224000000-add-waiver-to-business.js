'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('businesses', 'waiverText', {
      type: Sequelize.TEXT,
      allowNull: true,
      defaultValue: null,
    });
    
    await queryInterface.addColumn('businesses', 'waiverActive', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('businesses', 'waiverText');
    await queryInterface.removeColumn('businesses', 'waiverActive');
  }
};
