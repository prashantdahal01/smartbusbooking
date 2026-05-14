const Joi = require("joi");

const createReviewSchema = Joi.object({
  bookingId: Joi.string().trim().required(),
  busId: Joi.string().trim().required(),
  rating: Joi.number().min(1).max(5).required(),
  comment: Joi.string().trim().allow("").max(500),
}).required();

module.exports = {
  createReviewSchema,
};
