const Joi = require("joi");

const searchSchema = Joi.object({
  q: Joi.string().trim(),
  limit: Joi.any(),
}).unknown(true);

module.exports = {
  searchSchema,
};
