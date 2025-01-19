'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('emailTemplates', 'userId');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('emailTemplates', 'userId', {
      type: Sequelize.INTEGER,
      allowNull: true, // or false based on your requirements
      references: {
        model: 'users', // Make sure this matches the referenced table name
        key: 'id', // Assuming 'id' is the primary key in the 'users' table
      },
    });
  }
};
