const bayesianScore = require("./bayesianScore");
const reviewValidator = require("./reviewValidator");
const ratingService = require("./ratingService");

module.exports = {
  bayesianScore,
  reviewValidator,
  ratingService,
  computeWeightedScore: bayesianScore.computeWeightedScore,
  computeGlobalAverage: bayesianScore.computeGlobalAverage,
  validateReviewEligibility: reviewValidator.validateReviewEligibility,
};
