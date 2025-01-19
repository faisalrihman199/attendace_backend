

const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");


const User = sequelize.define("user", {
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
        type: DataTypes.TEXT,
        allownull:false
    },
    role:{
        type: DataTypes.STRING,
        allownull:false
    },
    photoPath:{
        type: DataTypes.TEXT,
        allownull:true
    },
    resetToken: {
        type: DataTypes.STRING,
        allowNull: true
    },
    resetTokenExpiry: {
        type: DataTypes.DATE,
        allowNull: true
    }
},{
    paranoid: true,
}
)

module.exports = User