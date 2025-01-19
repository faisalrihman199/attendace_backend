'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Step 1: Create the join table
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
          model: 'Athletes', // Ensure this matches your Athlete table name
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      athleteGroupId: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'AthleteGroups', // Ensure this matches your AthleteGroup table name
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    // Step 2: Migrate existing data
    const [athletes] = await queryInterface.sequelize.query(`
      SELECT id, athleteGroupId FROM Athletes WHERE athleteGroupId IS NOT NULL
    `);

    const insertPromises = athletes.map((athlete) =>
      queryInterface.bulkInsert('AthleteAthleteGroups', [
        {
          athleteId: athlete.id,
          athleteGroupId: athlete.athleteGroupId,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])
    );
    await Promise.all(insertPromises);

    // Step 3: Drop the old foreign key column if needed
    await queryInterface.removeColumn('Athletes', 'athleteGroupId');
  },

  down: async (queryInterface, Sequelize) => {
    // Step 1: Recreate the athleteGroupId column
    await queryInterface.addColumn('Athletes', 'athleteGroupId', {
      type: Sequelize.INTEGER,
      references: {
        model: 'AthleteGroups',
        key: 'id',
      },
      onDelete: 'CASCADE',
    });

    // Step 2: Migrate data back to the athleteGroupId column
    const [relations] = await queryInterface.sequelize.query(`
      SELECT athleteId, athleteGroupId FROM AthleteAthleteGroups
    `);

    const updatePromises = relations.map((relation) =>
      queryInterface.sequelize.query(`
        UPDATE Athletes
        SET athleteGroupId = ${relation.athleteGroupId}
        WHERE id = ${relation.athleteId}
      `)
    );
    await Promise.all(updatePromises);

    // Step 3: Drop the join table
    await queryInterface.dropTable('AthleteAthleteGroups');
  },
};
