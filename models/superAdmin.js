const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");


const superAdmin = sequelize.define("superAdmin", {
    photoPath:{
        type:DataTypes.TEXT,
    }
})