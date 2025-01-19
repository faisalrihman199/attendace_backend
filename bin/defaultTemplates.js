module.exports = [
    {
      name: "WelcomeEmail",
      subject: "Welcome to Our Business",
      htmlContent: "<html><body><h1>Welcome, {{recipientName}}!</h1><p>We are happy to have you on board.</p></body></html>",
    },
    {
      name: "welcome_athlete",
      subject: "Welcome to Our Athletic Program, {{athleteName}}!",
      htmlContent: `<html> <head> <style> body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; } .email-container { background-color: #ffffff; border-radius: 8px; padding: 20px; margin: 0 auto; width: 600px; text-align: center; } h1 { color: #333; } p { color: #555; } .qr-code { margin-top: 20px; } .footer { margin-top: 30px; font-size: 12px; color: #888; } </style> </head> <body> <div class="email-container"> <h1>Welcome to Our Athletic Program, {{athleteName}}!</h1> <p>We're excited to have you join our community of athletes. To get started, please use the following information:</p> <div class="athlete-info"> <p><strong>Name:</strong> {{athleteName}}</p> <p><strong>Date of Birth:</strong> {{dateOfBirth}}</p> <p><strong>Pin:</strong> {{pin}}</p> <p><strong>Description:</strong> {{description}}</p> </div> <div class="qr-code"> <p>Here is your QR code:</p> <img src="cid:qrcodeImage" alt="QR Code" /> </div> <div class="footer"> <p>If you have any questions, feel free to contact us.</p> <p>Best regards,<br>The Athletic Program Team</p> </div> </div> </body> </html>`,
    },
    {
      name: "otp_email_template",
      subject: "Your OTP Code for Account Verification",
      htmlContent: `<html> <head> <style> body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; } .email-container { background-color: #ffffff; border-radius: 8px; padding: 20px; margin: 0 auto; width: 600px; text-align: center; } h1 { color: #333; font-size: 24px; } p { color: #555; font-size: 16px; } .otp-code { font-size: 24px; color: #333; font-weight: bold; margin-top: 20px; } .footer { margin-top: 30px; font-size: 12px; color: #888; } </style> </head> <body> <div class="email-container"> <h1>Your OTP Code for Account Verification</h1> <p>Hello {{firstName}},</p> <p>We received a request to verify your account. Please use the following OTP to complete the process:</p> <div class="otp-code">{{otp}}</div> <p>This OTP will expire in 5 minutes. If you didn't request this, you can safely ignore this email.</p> <div class="footer"> <p>If you have any questions, feel free to contact us.</p> <p>Best regards,<br>The Support Team</p> </div> </div> </body> </html>`,
    },
    {
      name: "super_admin_notification",
      subject: "Important Notification for Super Admins",
      htmlContent: `<html> <head> <style> body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5; } .email-container { background-color: #ffffff; border-radius: 8px; padding: 20px; margin: 0 auto; width: 600px; text-align: center; } h1 { color: #333; } p { color: #555; font-size: 16px; line-height: 1.5; } .footer { margin-top: 30px; font-size: 12px; color: #888; } </style> </head> <body> <div class="email-container"> <h1>{{subject}}</h1> <p>Dear Super Admin,</p> <p>{{messageBody}}</p> <p>If you have any questions or need further assistance, please feel free to contact us.</p> <div class="footer"> <p>Best regards,<br>The Team</p> </div> </div> </body> </html>`,
    },
    {
      name: "check_in_notification",
      subject: "Check-In Confirmation: {{athleteName}}",
      htmlContent: `<html><head><style>body {font-family: Arial, sans-serif; background-color: #f9f9f9; color: #333;} .container {background: #fff; padding: 20px; border-radius: 10px; max-width: 600px; margin: auto;} h1 {color: #4CAF50;} p {line-height: 1.5;}</style></head><body><div class="container"><h1>Check-In Confirmation</h1><p>Dear {{athleteName}},</p><p>We are pleased to inform you that your check-in on <strong>{{checkinDate}}</strong> at <strong>{{checkinTime}}</strong> was successful.</p><p>Thank you for visiting us. We hope you have a great experience!</p><p>Best regards,<br>{{businessName}}</p></div></body></html>`,
    },
  ];
