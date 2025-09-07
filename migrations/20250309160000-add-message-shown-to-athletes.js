// 20250309160000-add-message-shown-to-athletes.js
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('Athletes', 'messageShown', {
      type: Sequelize.JSON,
      allowNull: true,
      defaultValue: null,
      comment: 'Array of message contexts: ["email","check-in"]',
    });

    // Initialize existing rows to empty array
    await queryInterface.sequelize.query(
      'UPDATE `Athletes` SET `messageShown` = JSON_ARRAY() WHERE `messageShown` IS NULL;'
    );
  },

  down: async (queryInterface) => {
    await queryInterface.removeColumn('Athletes', 'messageShown');
  }
};
