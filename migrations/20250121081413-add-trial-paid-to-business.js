module.exports = {
  async up(queryInterface, Sequelize) {
    // Add the 'trialPaid' column with a default value of true
    await queryInterface.addColumn('businesses', 'trialPaid', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true, // Set default value for existing rows
    });
  },

  async down(queryInterface) {
    // Remove the 'trialPaid' column in case of rollback
    await queryInterface.removeColumn('businesses', 'trialPaid');
  },
};
