var express = require('express');
var router = express.Router();
var controllers = require("../controllers/index")
var authmiddleware = require("../middlewares/authmiddleware")
var upload = require("../middlewares/filemiddleware")
router.get("/changeSub",authmiddleware.authenticate("jwt",{session:false}),controllers.user.changeSubscription)
router.post("/sendOtp",controllers.user.sendOtp)
router.post("/verifyOtp",controllers.user.verifyOtp)
router.post("/login",controllers.user.login)
router.post("/resetPassword",controllers.user.sendPasswordResetOtp)
router.post("/verifyPasswordReset",controllers.user.verifyOtpOnly)
router.post("/newPassword",controllers.user.verifyOtpAndResetPassword)
router.post("/addPaymentDetails",authmiddleware.authenticate("jwt",{session:false}),controllers.user.savePaymentDetails)
router.get("/getPaymentDetails",authmiddleware.authenticate("jwt",{session:false}),controllers.user.getPaymentDetails)
router.post("/createSubscription",authmiddleware.authenticate("jwt",{session:false}),controllers.user.createSubscription)
router.post("/webhook",express.json({type: 'application/json'}),controllers.user.webhook)
router.get("/getPaymentHistory",authmiddleware.authenticate("jwt",{session:false}),controllers.user.getPaymentDetails)
router.post("/contactUs",controllers.user.contactUs)
router.get("/paymentHistory",authmiddleware.authenticate("jwt",{session:false}),controllers.user.getPaymentHistory)
router.get("/getOne",authmiddleware.authenticate("jwt",{session:false}),controllers.user.getOneUser)
router.put("/update",authmiddleware.authenticate("jwt",{session:false}),controllers.user.updateUser)
router.get("/getCards",authmiddleware.authenticate("jwt",{session:false}),controllers.user.getUserCards)
router.delete("/cancelSubscription",authmiddleware.authenticate("jwt",{session:false}),controllers.user.cancelSubscription)
router.put("/updateCard",authmiddleware.authenticate("jwt",{session:false}),controllers.user.updateCardInfo)
router.post("/addMailTemplate",authmiddleware.authenticate("jwt",{session:false}),controllers.user.createEmailTemplate)
router.post("/sendTemplateMail",authmiddleware.authenticate("jwt",{session:false}),controllers.user.sendBusinessEmail)
router.get("/getMailTemplates",authmiddleware.authenticate("jwt",{session:false}),controllers.user.getEmailTemplateList)

// not enabled for protection 
// router.post("/addSuperAdmin",upload.single('photo'),controllers.user.addOrUpdateSuperAdmin)

module.exports = router;

