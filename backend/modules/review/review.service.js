const { ApiError } = require("../../utils/apiError");
const {
  submitReview,
  getBusReviews,
  getUserReviews,
  RatingServiceError,
} = require("../../algorithms/recommendation/ratingService");

const mapServiceError = (error) => {
  if (error instanceof ApiError) return error;

  if (error instanceof RatingServiceError) {
    return new ApiError(error.statusCode || 500, error.message || "Review request failed", {
      code: error.code || "RATING_SERVICE_ERROR",
      details: error.details || null,
    });
  }

  return new ApiError(500, error?.message || "Review request failed", {
    code: "REVIEW_SERVICE_ERROR",
  });
};

const createReview = async ({ userId, body }) => {
  try {
    if (!userId) {
      throw new ApiError(401, "Unauthorized", { code: "UNAUTHORIZED" });
    }

    const review = await submitReview({
      bookingId: body?.bookingId,
      busId: body?.busId,
      rating: body?.rating,
      comment: body?.comment,
      userId,
    });

    return review?.toObject ? review.toObject() : review;
  } catch (error) {
    throw mapServiceError(error);
  }
};

const listBusReviews = async ({ busId }) => {
  try {
    return await getBusReviews(busId);
  } catch (error) {
    throw mapServiceError(error);
  }
};

const listMyReviews = async ({ userId }) => {
  try {
    if (!userId) {
      throw new ApiError(401, "Unauthorized", { code: "UNAUTHORIZED" });
    }
    return await getUserReviews(userId);
  } catch (error) {
    throw mapServiceError(error);
  }
};

module.exports = {
  createReview,
  listBusReviews,
  listMyReviews,
};
