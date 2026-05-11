const { seatLockService } = require("../../algorithms/seatLock");

const getUserId = (req) => req?.user?.id || req?.user?._id || null;

exports.lock = async (req, res) => {
  try {
    const userId = getUserId(req);
    const sessionId = req.body?.sessionId || req.headers["x-session-id"];

    const result = await seatLockService.lockSeats({
      scheduleId: req.body?.scheduleId,
      seats: req.body?.seats,
      userId,
      sessionId,
    });

    return res.json(result);
  } catch (error) {
    const formatted = seatLockService.formatError(error);
    return res.status(formatted.statusCode).json(formatted.payload);
  }
};

exports.validate = async (req, res) => {
  try {
    const userId = getUserId(req);
    const result = await seatLockService.validateLocks({
      scheduleId: req.body?.scheduleId,
      seats: req.body?.seats,
      userId,
    });

    return res.json(result);
  } catch (error) {
    const formatted = seatLockService.formatError(error);
    return res.status(formatted.statusCode).json(formatted.payload);
  }
};

exports.release = async (req, res) => {
  try {
    const userId = getUserId(req);
    const result = await seatLockService.releaseLocks({
      scheduleId: req.body?.scheduleId,
      seats: req.body?.seats,
      userId,
    });

    return res.json(result);
  } catch (error) {
    const formatted = seatLockService.formatError(error);
    return res.status(formatted.statusCode).json(formatted.payload);
  }
};
