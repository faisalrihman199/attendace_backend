var express = require('express');
var router = express.Router();
var controllers = require("../controllers/index")
var authmiddleware = require("../middlewares/authmiddleware")


router.post("/save",authmiddleware.authenticate("jwt",{session:false}),controllers.scheduleController.createOrUpdateSchedule)
router.get("/",authmiddleware.authenticate("jwt",{session:false}),controllers.scheduleController.getSchedules)
router.delete("/",authmiddleware.authenticate("jwt",{session:false}),controllers.scheduleController.deleteSchedule)


module.exports = router;