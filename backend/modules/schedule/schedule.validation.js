const Joi = require("joi");

const searchSchema = Joi.object({
  source: Joi.string().trim(),
  from: Joi.string().trim(),
  destination: Joi.string().trim(),
  to: Joi.string().trim(),
  date: Joi.string().trim(),
  travelDate: Joi.string().trim(),
  includeRoutePlan: Joi.any(),
}).unknown(true);

const operatorScheduleCreateSchema = Joi.object({
  bus: Joi.any(),
  route: Joi.any(),
  date: Joi.string().trim(),
  time: Joi.string().trim(),
  arrivalTime: Joi.string().trim(),
  arrivalDate: Joi.string().trim(),
  price: Joi.any(),
  amenities: Joi.any(),
  features: Joi.any(),
  isActive: Joi.any(),
  refundable: Joi.any(),
}).unknown(true);

const operatorScheduleUpdateSchema = Joi.object({
  time: Joi.string().trim(),
  price: Joi.any(),
  isActive: Joi.any(),
}).unknown(true);

module.exports = {
  searchSchema,
  operatorScheduleCreateSchema,
  operatorScheduleUpdateSchema,
};
