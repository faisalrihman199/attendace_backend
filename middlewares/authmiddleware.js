const passport = require("passport");
const model = require('../models/index')
const JwtStrategy = require("passport-jwt").Strategy;
const { ExtractJwt } = require("passport-jwt");
require("dotenv").config()
var opts = {
    jwtFromRequest : ExtractJwt.fromAuthHeaderAsBearerToken(),
    secretOrKey: process.env.JWT_SECRET
}
passport.use(
    new JwtStrategy(opts, async function (jwt_payload,done){
        try {
            var user = await model.user.findOne({where: {id: jwt_payload.id}});
            user = user.dataValues
            console.log("pass user",{...user,});
            if (user){
                return done(null,user)
            }else{
                return done(null,false)
            }
        } catch (error) {
            return done(error,false)
        }
    })
)
module.exports = passport