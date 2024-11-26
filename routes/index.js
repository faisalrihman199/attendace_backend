var express = require('express');
var router = express.Router();
var user = require("./users")
var business = require("./buisiness")
var athelete = require("./athelete")
/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'attendence' });
});
router.use("/user",user)
router.use("/business",business)
router.use("/athelete",athelete)
module.exports = router;
