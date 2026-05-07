const Joi = require("joi");

const createBookingSchema = Joi.object({
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

const lockSchema = Joi.object({
  scheduleId: Joi.string().trim().required(),
  seats: Joi.array().items(Joi.string().trim()).min(1).required(),
  sessionId: Joi.string().trim().optional(),
}).unknown(true);

module.exports = {
  createBookingSchema,
  lockSchema,
};
