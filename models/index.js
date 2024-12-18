'use strict';

const fs = require('fs');
const path = require('path');
const user = require("./user")
const tempUser = require("./tempUser")
const paymentDetails = require("./paymentDetails")
const paymentHistory = require("./paymentHistory");
const AthleteGroup = require('./atheleteGroup');
const Athlete = require("./athelete")
const plan = require("./plan")
const subscription = require("./subscription")
const business = require("./business")
const checkin = require("./checkIn")
const reporting = require("./reporting")
const emailTemplate = require("./emailTemplate")


user.hasOne(paymentDetails);
paymentDetails.belongsTo(user);

user.hasOne(business)
business.belongsTo(user)

plan.hasOne(subscription)
subscription.belongsTo(plan)

user.hasOne(subscription)
subscription.belongsTo(user)

subscription.hasMany(paymentHistory)
paymentHistory.belongsTo(subscription)

business.hasMany(AthleteGroup,{ foreignKey: 'businessId', onDelete: 'CASCADE' });
AthleteGroup.belongsTo(business,{ foreignKey: 'businessId' });

user.hasOne(business)
business.belongsTo(user)

business.hasOne(reporting)
reporting.belongsTo(business)

Athlete.belongsToMany(AthleteGroup, { through: 'AthleteAthleteGroups' })
// AthleteGroup.js
AthleteGroup.belongsToMany(Athlete, { through: 'AthleteAthleteGroups' });

Athlete.hasMany(checkin,{ foreignKey: 'athleteId', onDelete: 'CASCADE' })
checkin.belongsTo(Athlete,{foreignKey: 'athleteId'})

module.exports = {user,tempUser,paymentDetails,paymentHistory,Athlete,AthleteGroup,plan,subscription,business,checkin,reporting,emailTemplate};
