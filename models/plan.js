const { DataTypes } = require('sequelize');
const sequelize = require('../config/db'); // Import your Sequelize connection

const paymentPlan = sequelize.define('paymentPlan',{
    planId:{
        type:DataTypes.STRING,
    },
    planPrice:{
        type:DataTypes.STRING
    },
    planType:{
        type:DataTypes.STRING
    }

})

module.exports = paymentPlan