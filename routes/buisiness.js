var express = require('express');
var router = express.Router();
var controllers = require("../controllers/index")
var authmiddleware = require("../middlewares/authmiddleware")
// var paymiddleware = require("../middlewares/subscriptionMiddleware")
var upload = require("../middlewares/businessmiddleware")


router.post("/addBusiness",controllers.business.addBusiness)
router.get("/getOne",authmiddleware.authenticate("jwt",{session:false}),controllers.business.getOneBusiness)
router.get("/getAll",authmiddleware.authenticate("jwt",{session:false}),controllers.business.getAllBusinesses)
router.post("/createAtheleteGroup",authmiddleware.authenticate("jwt",{session:false}),controllers.business.addAthleteGroup)
router.post("/createBusiness",authmiddleware.authenticate("jwt",{session:false}),upload.single("photo"),controllers.business.createBusiness)
router.delete("/delete/:businessId",authmiddleware.authenticate("jwt",{session:false}),controllers.business.deleteBusiness)
router.delete("/deleteAtheleteGroup/:id",authmiddleware.authenticate("jwt",{session:false}),controllers.business.deleteAthleteGroup)
router.get("/updateBusinessStatus/:id",authmiddleware.authenticate("jwt",{session:false}),controllers.business.setBusinessStatusInactive)
router.get("/cancel",authmiddleware.authenticate("jwt",{session:false}),controllers.business.cancelBusiness)
router.get("/updateTrialPaid/:id",authmiddleware.authenticate("jwt",{session:false}),controllers.business.updateTrialPaid)
router.get("/getAtheleteGroups",authmiddleware.authenticate("jwt",{session:false}),controllers.business.getAthleteGroupsByCategory)
router.post("/adminCreateUser",authmiddleware.authenticate("jwt",{session:false}),controllers.business.createUser)
router.get("/AtheleteGroups",authmiddleware.authenticate("jwt",{session:false}),controllers.business.getAllAthleteGroups)
router.get("/reporting",authmiddleware.authenticate("jwt",{session:false}),controllers.business.getOneReporting)
router.put("/updateReporting",authmiddleware.authenticate("jwt",{session:false}),controllers.business.updateReporting)
router.post("/detail",controllers.business.getBusinessNameandPhoto)
router.get("/stats",authmiddleware.authenticate("jwt",{session:false}),controllers.business.getBusinessStatistics)
router.post("/submitWaiver",controllers.business.submitWaiver)
module.exports = router