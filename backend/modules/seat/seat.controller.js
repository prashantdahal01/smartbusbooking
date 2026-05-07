const seatService = require("./seat.service");
const { sendSuccess } = require("../../utils/apiResponse");
const { handleControllerError } = require("../../utils/controllerHelpers");

const getUserId = (req) => req?.user?.id || req?.user?._id || null;

exports.getSeatLayout = async (req, res) => {
  try {
    const data = await seatService.getSeatLayout(req.params.busId);
    return sendSuccess(res, { data, message: "Seat layout fetched" });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.getSeatAvailability = async (req, res) => {
  try {
    const data = await seatService.getSeatAvailability({ scheduleId: req.query.scheduleId });
    return sendSuccess(res, { data, message: "Seat availability fetched" });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.lockSeats = async (req, res) => {
  try {
    const data = await seatService.lockSeats({
      scheduleId: req.body?.scheduleId,
      seats: req.body?.seats,
      userId: getUserId(req),
      sessionId: req.body?.sessionId || req.headers["x-session-id"],
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

exports.validateLocks = async (req, res) => {
  try {
    const data = await seatService.validateLocks({
      scheduleId: req.body?.scheduleId,
      seats: req.body?.seats,
      userId: getUserId(req),
    });
    return sendSuccess(res, { data, message: "Seat locks validated" });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.releaseLocks = async (req, res) => {
  try {
    const data = await seatService.releaseLocks({
      scheduleId: req.body?.scheduleId,
      seats: req.body?.seats,
      userId: getUserId(req),
    });
    return sendSuccess(res, { data, message: "Seats unlocked" });
  } catch (error) {
    return handleControllerError(res, error);
  }
};
