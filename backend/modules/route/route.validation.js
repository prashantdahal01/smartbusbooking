const Joi = require("joi");

const createRouteSchema = Joi.object({
  sourceCityId: Joi.string().trim(),
  sourceCity: Joi.string().trim(),
  destinationCityId: Joi.string().trim(),
  destinationCity: Joi.string().trim(),
  distance: Joi.number(),
  boardingPoints: Joi.any(),
  droppingPoints: Joi.any(),
}).unknown(true);

module.exports = {
  createRouteSchema,
};
