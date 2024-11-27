var express = require('express');
var router = express.Router();
var controllers = require("../controllers/index")
var authmiddleware = require("../middlewares/authmiddleware")
var upload = require("../middlewares/atheletemiddleware")
var upload2 = require("../middlewares/bulkstudent")
router.get("/getPin",authmiddleware.authenticate("jwt",{session:false}),controllers.Athelete.getUniquePin)
router.post("/addAthelete",authmiddleware.authenticate("jwt",{session:false}),upload.single("photo"),controllers.Athelete.createAthlete)
router.delete("/delete/:id",authmiddleware.authenticate("jwt",{session:false}),controllers.Athelete.deleteAthlete)
router.get("/atheletes",authmiddleware.authenticate("jwt",{session:false}),controllers.Athelete.getAllAthletes)
router.post("/checkIn",controllers.Athelete.checkInByPin)
router.get("/getAttendence",authmiddleware.authenticate("jwt",{session:false}),controllers.Athelete.getAthleteCheckins)
router.get("/getAttendencePdf",authmiddleware.authenticate("jwt",{session:false}),controllers.Athelete.getAthleteCheckinsPdf)
router.post("/fileUpload",authmiddleware.authenticate("jwt",{session:false}),upload2.single("file"),controllers.Athelete.bulkUploadAthletes)
router.get("/checkPin",authmiddleware.authenticate("jwt",{session:false}),controllers.Athelete.checkPin)
module.exports = router