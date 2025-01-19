

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");


const tempUser = sequelize.define("tempUser", {
    firstName:{
        type: DataTypes.STRING,
        allownull:true,
        
    },
    lastName:{
        type: DataTypes.STRING,
        allownull:true,
        
    },
    email:{
        type: DataTypes.STRING,
        allownull:false,
        unique:true
    },
    password:{
        type: DataTypes.STRING,
        allownull:false
    },
    role:{
        type: DataTypes.STRING,
        allownull:false
    },
    resetToken: {
        type: DataTypes.STRING,
        allowNull: true
    },
    resetTokenExpiry: {
        type: DataTypes.DATE,
        allowNull: true
    }
})

module.exports = tempUser