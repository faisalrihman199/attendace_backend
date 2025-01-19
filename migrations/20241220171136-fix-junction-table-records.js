'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Remove invalid rows from AthleteAthleteGroups where athleteId does not exist in Athletes
    await queryInterface.sequelize.query(`
      DELETE FROM \`AthleteAthleteGroups\`
      WHERE \`athleteId\` NOT IN (SELECT \`id\` FROM \`Athletes\`);
    `);

    // Remove invalid rows from AthleteAthleteGroups where athleteGroupId does not exist in AthleteGroups
    await queryInterface.sequelize.query(`
      DELETE FROM \`AthleteAthleteGroups\`
      WHERE \`athleteGroupId\` NOT IN (SELECT \`id\` FROM \`AthleteGroups\`);
    `);
  },

  down: async (queryInterface, Sequelize) => {
    // Down migration: Cannot restore deleted records
    console.warn('This migration is irreversible.');
  },
};
