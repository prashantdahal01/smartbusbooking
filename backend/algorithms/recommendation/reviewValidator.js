const { Booking } = require("../../modules/booking/booking.model");
const { Review } = require("../../models/Review");

class ReviewEligibilityError extends Error {
  constructor(message, { statusCode = 400, code = "REVIEW_ELIGIBILITY_ERROR", details = null } = {}) {
    super(message);
    this.name = "ReviewEligibilityError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

const normalizeText = (value) => String(value || "").trim();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

const parseDateTimeMs = (dateText, timeText) => {
  const safeDate = normalizeText(dateText);
  if (!DATE_RE.test(safeDate)) return NaN;

  const safeTime = TIME_RE.test(normalizeText(timeText))
    ? normalizeText(timeText)
    : "23:59";

  const parsed = new Date(`${safeDate}T${safeTime}:00`);
  return parsed.getTime();
};

const isCompletedBooking = (booking) => {
  const status = normalizeText(booking?.status).toLowerCase();
  if (status === "completed") return true;
  if (status !== "confirmed") return false;

  const schedule = booking?.schedule || {};
  const completionMs = parseDateTimeMs(
    schedule?.arrivalDate || schedule?.date,
    schedule?.arrivalTime || schedule?.time
  );

  if (!Number.isFinite(completionMs)) return false;
  return completionMs < Date.now();
};

const validateReviewEligibility = async (bookingId, userId) => {
  const safeBookingId = normalizeText(bookingId);
  if (!safeBookingId) {
    throw new ReviewEligibilityError("bookingId is required", {
      statusCode: 400,
      code: "BOOKING_ID_REQUIRED",
    });
  }

  if (!userId) {
    throw new ReviewEligibilityError("Unauthorized", {
      statusCode: 401,
      code: "UNAUTHORIZED",
    });
  }

  const booking = await Booking.findById(safeBookingId)
    .populate({
      path: "schedule",
      select: "date time arrivalDate arrivalTime bus",
      populate: { path: "bus", select: "_id" },
    })
    .lean();

  if (!booking) {
    throw new ReviewEligibilityError("Booking not found", {
      statusCode: 404,
      code: "BOOKING_NOT_FOUND",
    });
  }

  if (String(booking.user || "") !== String(userId || "")) {
    throw new ReviewEligibilityError("Booking does not belong to current user", {
      statusCode: 403,
      code: "BOOKING_OWNERSHIP_ERROR",
    });
  }

  if (!isCompletedBooking(booking)) {
    throw new ReviewEligibilityError("Booking is not completed yet", {
      statusCode: 409,
      code: "BOOKING_NOT_COMPLETED",
    });
  }

  const existingReview = await Review.findOne({ bookingId: booking._id })
    .select("_id")
    .lean();

  if (existingReview) {
    throw new ReviewEligibilityError("Review already submitted for this booking", {
      statusCode: 409,
      code: "REVIEW_ALREADY_EXISTS",
    });
  }

  return booking;
};

const isReviewEligibilityError = (error) => (
  error instanceof ReviewEligibilityError
  || error?.name === "ReviewEligibilityError"
  || error?.code === "REVIEW_ELIGIBILITY_ERROR"
);

module.exports = {
  ReviewEligibilityError,
  validateReviewEligibility,
  isReviewEligibilityError,
};
