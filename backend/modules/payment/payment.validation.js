const Joi = require("joi");

const initiateSchema = Joi.object({
  scheduleId: Joi.string().trim().required(),
  seats: Joi.array().items(Joi.string().trim()).min(1).required(),
  passenger: Joi.object({
    name: Joi.string().trim().required(),
    age: Joi.number().integer().min(1).max(120).required(),
    gender: Joi.string().valid("male", "female", "other").required(),
    phone: Joi.string().trim().required(),
  }).required(),
  boardingPoint: Joi.string().trim().required(),
  droppingPoint: Joi.string().trim().required(),
}).unknown(true);

const verifySchema = Joi.object({
  bookingId: Joi.string().trim().required(),
}).unknown(true);

const retrySchema = Joi.object({
  bookingId: Joi.string().trim().required(),
}).unknown(true);

module.exports = {
  initiateSchema,
  verifySchema,
  retrySchema,
};
