const Joi = require("joi");

const createStopSchema = Joi.object({
  route: Joi.string().trim(),
  routeId: Joi.string().trim(),
  stops: Joi.array(),
  city: Joi.any(),
  cityId: Joi.any(),
  name: Joi.any(),
  type: Joi.string().trim(),
  order: Joi.any(),
  offsetMinutes: Joi.any(),
  absoluteTime: Joi.any(),
}).unknown(true);

const updateStopSchema = Joi.object({
  type: Joi.string().trim(),
  order: Joi.any(),
  offsetMinutes: Joi.any(),
  absoluteTime: Joi.any(),
}).unknown(true);

module.exports = {
  createStopSchema,
  updateStopSchema,
};
