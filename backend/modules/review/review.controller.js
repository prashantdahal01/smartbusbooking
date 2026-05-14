const { ApiError } = require("../../utils/apiError");
const { sendSuccess } = require("../../utils/apiResponse");
const { handleControllerError } = require("../../utils/controllerHelpers");
const reviewService = require("./review.service");
const { createReviewSchema } = require("./review.validation");

const validate = (schema, payload) => {
  const { error } = schema.validate(payload);
  if (error) {
    throw new ApiError(400, error.details?.[0]?.message || "Invalid request", null);
  }
};

exports.createReview = async (req, res) => {
  try {
    validate(createReviewSchema, req.body || {});

    const review = await reviewService.createReview({
      userId: req.user?.id,
      body: req.body,
    });

    return res.status(201).json({
      success: true,
      review,
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.getBusReviews = async (req, res) => {
  try {
    const data = await reviewService.listBusReviews({ busId: req.params.busId });
    return sendSuccess(res, { data, message: "Bus reviews fetched" });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.getMyReviews = async (req, res) => {
  try {
    const data = await reviewService.listMyReviews({ userId: req.user?.id });
    return sendSuccess(res, { data, message: "My reviews fetched" });
  } catch (error) {
    return handleControllerError(res, error);
  }
};
