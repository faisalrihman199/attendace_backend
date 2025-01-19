const { DataTypes } = require('sequelize');
const sequelize = require('../config/db'); // Import your Sequelize connection

const subscription = sequelize.define('subscription', {
    subscriptionId: {
        type: DataTypes.STRING,
    },
    subscriptionStatus:{
        type:DataTypes.STRING
    }

})

module.exports = subscription