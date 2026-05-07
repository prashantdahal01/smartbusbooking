const bookingService = require("./booking.service");
const { sendSuccess } = require("../../utils/apiResponse");
const { handleControllerError } = require("../../utils/controllerHelpers");
const { ApiError } = require("../../utils/apiError");
const { createBookingSchema, lockSchema } = require("./booking.validation");

const validate = (schema, payload) => {
  const { error } = schema.validate(payload);
  if (error) {
    throw new ApiError(400, error.details?.[0]?.message || "Invalid request", null);
  }
};

exports.lockSeats = async (req, res) => {
  try {
    validate(lockSchema, req.body || {});
    const data = await bookingService.lockSeats({
      scheduleId: req.body?.scheduleId,
      seats: req.body?.seats,
      userId: req.user?.id,
      sessionId: req.body?.sessionId,
    });
    return sendSuccess(res, {
      data: {
        seats: data.seats,
        lockedSeats: data.seats,
        failedSeats: [],
        expiresAt: data.expiresAt,
        lockDurationMs: data.lockDurationMs,
      },
      message: "Seats locked",
    });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.unlockSeats = async (req, res) => {
  try {
    validate(lockSchema, req.body || {});
    const data = await bookingService.unlockSeats({
      scheduleId: req.body?.scheduleId,
      seats: req.body?.seats,
      userId: req.user?.id,
    });
    return sendSuccess(res, { data, message: "Seats unlocked" });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.createBooking = async (req, res) => {
  try {
    validate(createBookingSchema, req.body || {});
    const data = await bookingService.createBooking({ userId: req.user?.id, body: req.body });
    return sendSuccess(res, { data, message: "Booking created", status: 201 });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.getMyBookings = async (req, res) => {
  try {
    const data = await bookingService.getMyBookings({ userId: req.user?.id });
    return sendSuccess(res, { data, message: "Bookings fetched" });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.getOperatorBookings = async (req, res) => {
  try {
    const data = await bookingService.getOperatorBookings({ operatorId: req.user?.id, query: req.query });
    return sendSuccess(res, { data, message: "Operator bookings fetched" });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.getBookingById = async (req, res) => {
  try {
    const data = await bookingService.getBookingById({ bookingId: req.params.id, user: req.user });
    return sendSuccess(res, { data, message: "Booking fetched" });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.getTicketPdf = async (req, res) => {
  try {
    const { pdf, filename } = await bookingService.getTicketPdf({ bookingId: req.params.id, user: req.user });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).send(pdf);
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.cancelBooking = async (req, res) => {
  try {
    const data = await bookingService.cancelBooking({ bookingId: req.params.id, user: req.user });
    return sendSuccess(res, { data, message: data?.message || "Booking cancelled" });
  } catch (error) {
    return handleControllerError(res, error);
  }
};
