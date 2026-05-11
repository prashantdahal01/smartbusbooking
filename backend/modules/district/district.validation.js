const Joi = require("joi");

const districtCreateSchema = Joi.object({
  district: Joi.string().trim(),
  name: Joi.string().trim(),
  cities: Joi.array(),
}).unknown(true);

const districtUpdateSchema = Joi.object({
  district: Joi.string().trim(),
  name: Joi.string().trim(),
}).unknown(true);

const citySchema = Joi.object({
  name: Joi.string().trim(),
  city: Joi.string().trim(),
}).unknown(true);

module.exports = {
  districtCreateSchema,
  districtUpdateSchema,
  citySchema,
};
