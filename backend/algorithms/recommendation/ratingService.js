const { Review } = require("../../models/Review");
const {
  ReviewEligibilityError,
  isReviewEligibilityError,
  validateReviewEligibility,
} = require("./reviewValidator");

class RatingServiceError extends Error {
  constructor(message, { statusCode = 500, code = "RATING_SERVICE_ERROR", details = null } = {}) {
    super(message || "Rating service error");
    this.name = "RatingServiceError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

const toServiceError = (error) => {
  if (error instanceof RatingServiceError) return error;

  if (error instanceof ReviewEligibilityError || isReviewEligibilityError(error)) {
    return new RatingServiceError(error.message || "Review eligibility failed", {
      statusCode: error.statusCode || 400,
      code: error.code || "REVIEW_ELIGIBILITY_ERROR",
      details: error.details || null,
    });
  }

  return new RatingServiceError(error?.message || "Rating service error", {
    statusCode: 500,
    code: "RATING_SERVICE_ERROR",
  });
};

const withMappedError = async (fn) => {
  try {
    return await fn();
  } catch (error) {
    throw toServiceError(error);
  }
};

const submitReview = async (data = {}) => {
  return withMappedError(async () => {
    const bookingId = String(data.bookingId || "").trim();
    const busId = String(data.busId || "").trim();
    const userId = String(data.userId || "").trim();
    const rating = Number(data.rating);
    const comment = typeof data.comment === "string" ? data.comment.trim() : "";

    if (!bookingId) {
      throw new RatingServiceError("bookingId is required", {
        statusCode: 400,
        code: "BOOKING_ID_REQUIRED",
      });
    }

    if (!busId) {
      throw new RatingServiceError("busId is required", {
        statusCode: 400,
        code: "BUS_ID_REQUIRED",
      });
    }

    if (!userId) {
      throw new RatingServiceError("User is required", {
        statusCode: 401,
        code: "UNAUTHORIZED",
      });
    }

    if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
      throw new RatingServiceError("rating must be between 1 and 5", {
        statusCode: 400,
        code: "INVALID_RATING",
      });
    }

    const booking = await validateReviewEligibility(bookingId, userId);
    const bookingBusId = String(booking?.schedule?.bus?._id || booking?.schedule?.bus || "").trim();

    if (bookingBusId && bookingBusId !== busId) {
      throw new RatingServiceError("Bus does not match booking", {
        statusCode: 400,
        code: "BUS_MISMATCH",
      });
    }

    const review = await Review.create({
      bookingId: booking._id,
      busId: bookingBusId || busId,
      userId,
      rating,
      comment: comment || undefined,
    });

    return review;
  });
};

const getBusReviews = async (busId) => {
  return withMappedError(async () => {
    const safeBusId = String(busId || "").trim();
    if (!safeBusId) {
      throw new RatingServiceError("busId is required", {
        statusCode: 400,
        code: "BUS_ID_REQUIRED",
      });
    }

    const reviews = await Review.find({ busId: safeBusId })
      .sort({ createdAt: -1 })
      .populate({ path: "userId", select: "name" })
      .lean();

    return (Array.isArray(reviews) ? reviews : []).map((review) => ({
      id: String(review?._id || ""),
      userName: String(review?.userId?.name || "").trim() || "Anonymous",
      rating: Number(review?.rating || 0),
      comment: String(review?.comment || "").trim() || "",
      createdAt: review?.createdAt || null,
    }));
  });
};

const getUserReviews = async (userId) => {
  return withMappedError(async () => {
    const safeUserId = String(userId || "").trim();
    if (!safeUserId) {
      throw new RatingServiceError("User is required", {
        statusCode: 401,
        code: "UNAUTHORIZED",
      });
    }

    const reviews = await Review.find({ userId: safeUserId })
      .sort({ createdAt: -1 })
      .populate({ path: "busId", select: "name" })
      .populate({
        path: "bookingId",
        select: "schedule",
        populate: { path: "schedule", select: "date" },
      })
      .lean();

    return (Array.isArray(reviews) ? reviews : []).map((review) => {
      const busName = String(review?.busId?.name || "").trim() || "Bus";
      const bookingDoc = review?.bookingId || {};
      const journeyDate = bookingDoc?.schedule?.date || null;
      const bookingIdValue = String(bookingDoc?._id || review?.bookingId || "");
      const busIdValue = String(review?.busId?._id || review?.busId || "");

      return {
        id: String(review?._id || ""),
        bookingId: bookingIdValue,
        busId: busIdValue,
        busName,
        journeyDate,
        rating: Number(review?.rating || 0),
        comment: String(review?.comment || "").trim() || "",
        createdAt: review?.createdAt || null,
      };
    });
  });
};

module.exports = {
  RatingServiceError,
  submitReview,
  getBusReviews,
  getUserReviews,
};
