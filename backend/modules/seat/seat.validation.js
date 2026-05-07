const Joi = require("joi");

const lockSchema = Joi.object({
  scheduleId: Joi.string().trim().required(),
  seats: Joi.array().items(Joi.string().trim()).min(1).required(),
  sessionId: Joi.string().trim().optional(),
}).unknown(true);

const availabilitySchema = Joi.object({
  scheduleId: Joi.string().trim().required(),
}).unknown(true);

module.exports = {
  lockSchema,
  availabilitySchema,
};
