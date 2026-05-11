const Joi = require("joi");

const registerSchema = Joi.object({
  name: Joi.string().trim().required().messages({
    "any.required": "name, email, password are required",
    "string.empty": "name, email, password are required",
  }),
  email: Joi.string().trim().required().messages({
    "any.required": "name, email, password are required",
    "string.empty": "name, email, password are required",
  }),
  password: Joi.string().trim().required().messages({
    "any.required": "name, email, password are required",
    "string.empty": "name, email, password are required",
  }),
  phone: Joi.string().trim().allow("", null),
}).unknown(true);

const loginSchema = Joi.object({
  email: Joi.string().trim().required().messages({
    "any.required": "email and password are required",
    "string.empty": "email and password are required",
  }),
  password: Joi.string().trim().required().messages({
    "any.required": "email and password are required",
    "string.empty": "email and password are required",
  }),
}).unknown(true);

const forgotSchema = Joi.object({
  email: Joi.string().trim().required().messages({
    "any.required": "email is required",
    "string.empty": "email is required",
  }),
}).unknown(true);

const resetSchema = Joi.object({
  token: Joi.string().trim().required().messages({
    "any.required": "token and password are required",
    "string.empty": "token and password are required",
  }),
  password: Joi.string().trim().required().messages({
    "any.required": "token and password are required",
    "string.empty": "token and password are required",
  }),
  confirmPassword: Joi.string().trim().optional(),
}).unknown(true);

module.exports = {
  registerSchema,
  loginSchema,
  forgotSchema,
  resetSchema,
};
