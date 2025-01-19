const { DataTypes } = require('sequelize');
const sequelize = require('../config/db'); // Import your Sequelize connection

const Payment = sequelize.define('paymentDetails', {
    cardHolderName: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    CardNumber: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    CVC: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    Expiry: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    region: {
        type: DataTypes.STRING,
        allowNull: false,
    },
}, {
    timestamps: true,
});

module.exports = Payment;
