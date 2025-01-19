const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");


const paymentHistory = sequelize.define("paymentHistory", {
    invoiceId:{
        type:DataTypes.STRING,
        allowNull:false
    },
    invoiceNumber:{
        type:DataTypes.STRING,
        allowNull:false
    },
    amount:{
        type:DataTypes.STRING,
        allowNull:false
    },
    status:{
        type:DataTypes.STRING,
        allowNull:false
    },
    date:{
        type:DataTypes.DATE,
        allowNull:false
    }
})

module.exports = paymentHistory