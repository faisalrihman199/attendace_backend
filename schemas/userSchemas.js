const Joi = require('joi');


const sendOtpSchema = Joi.object({
    firstName: Joi.string()
        .min(2)
        .max(30)
        .required()
        .messages({
            'string.base': `"First Name" should be a type of 'text'`,
            'string.empty': `"First Name" cannot be an empty field`,
            'string.min': `"First Name" should have a minimum length of {#limit}`,
            'string.max': `"First Name" should have a maximum length of {#limit}`,
            'any.required': `"First Name" is a required field`
        }),
    
    lastName: Joi.string()
        .min(2)
        .max(30)
        .required()
        .messages({
            'string.base': `"Last Name" should be a type of 'text'`,
            'string.empty': `"Last Name" cannot be an empty field`,
            'string.min': `"Last Name" should have a minimum length of {#limit}`,
            'string.max': `"Last Name" should have a maximum length of {#limit}`,
            'any.required': `"Last Name" is a required field`
        }),

    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.email': `"Email" must be a valid email`,
            'any.required': `"Email" is a required field`
        }),

    password: Joi.string()
        .min(8)
        .required()
        .messages({
            'string.min': `"Password" should have a minimum length of {#limit}`,
            'any.required': `"Password" is a required field`
        }),

    
});

const verifyOtpSchema = Joi.object({
    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.email': `"Email" must be a valid email`,
            'any.required': `"Email" is a required field`
        }),
    otp:Joi.string()
        .required()
        .messages({
            'any.required': `"OTP" is a required field`
        })
})

const loginSchema = Joi.object({
    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.email': `"Email" must be a valid email`,
            'any.required': `"Email" is a required field`
        }),
    password:Joi.string()
        .required()
        .messages({
            'any.required': `"password" is a required field`
        })
})

const sendPasswordResetOtpSchema = Joi.object({
    email: Joi.string()
        .email()
        .required()
        .messages({
            'string.email': `"Email" must be a valid email`,
            'any.required': `"Email" is a required field`
        })
});


module.exports = { sendOtpSchema ,verifyOtpSchema,loginSchema,sendPasswordResetOtpSchema};
