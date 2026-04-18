const {
  LOCK_TTL_MS,
  SeatLockError,
  lockSeats: lockSeatsWithManager,
  validateLocks: validateLocksWithManager,
  releaseLocks: releaseLocksWithManager,
  confirmBooking: confirmBookingWithManager,
  getActiveLocks,
} = require("./seatLockManager");
const {
  SeatLockValidationError,
  normalizeSeats,
  validateScheduleId,
  validateLockPayload,
} = require("./seatLockValidator");

class SeatLockServiceError extends Error {
  constructor({ statusCode = 500, payload = { message: "Internal server error" } } = {}) {
    super(payload?.message || "Seat lock service error");
    this.name = "SeatLockServiceError";
    this.statusCode = statusCode;
    this.payload = payload;
  }
}

const toServiceError = (error) => {
  if (error instanceof SeatLockServiceError) return error;

  if (error instanceof SeatLockError || error instanceof SeatLockValidationError) {
    return new SeatLockServiceError({
      statusCode: error.statusCode || 400,
      payload: {
        message: error.message,
        code: error.code,
        ...(error.details || {}),
      },
    });
  }

  return new SeatLockServiceError({
    statusCode: 500,
    payload: { message: error?.message || "Internal server error" },
  });
};

const withMappedError = async (fn) => {
  try {
    return await fn();
  } catch (error) {
    throw toServiceError(error);
  }
};

const lockSeats = async ({ scheduleId, seats, userId, sessionId } = {}) => {
  return withMappedError(async () => {
    validateLockPayload({ scheduleId, seats });

    const result = await lockSeatsWithManager({
      scheduleId,
      seats,
      userId,
      sessionId,
    });

    return {
      success: true,
      seats: result.seats,
      expiresAt: result.expiresAt,
      lockDurationMs: result.lockDurationMs,
    };
  });
};

const validateLocks = async ({ scheduleId, seats, userId } = {}) => {
  return withMappedError(async () => {
    validateLockPayload({ scheduleId, seats });

    const result = await validateLocksWithManager({
      scheduleId,
      seats,
      userId,
    });

    return {
      valid: result.valid,
      expiresAt: result.expiresAt,
      missingLocks: result.missingSeats,
      conflictSeats: result.conflictSeats,
    };
  });
};

const releaseLocks = async ({ scheduleId, seats, userId, allowEmptySeats = false } = {}) => {
  return withMappedError(async () => {
    validateScheduleId(scheduleId);
    if (!allowEmptySeats) {
      normalizeSeats(seats);
    }

    const result = await releaseLocksWithManager({
      scheduleId,
      seats,
      userId,
    });

    return {
      success: true,
      releasedCount: result.releasedCount,
    };
  });
};

const confirmBooking = async ({ scheduleId, seats, userId, confirmFn } = {}) => {
  return withMappedError(async () => {
    validateLockPayload({ scheduleId, seats });
    return confirmBookingWithManager({
      scheduleId,
      seats,
      userId,
      confirmFn,
    });
  });
};

const getActiveSeatLocks = async (scheduleId) => {
  return withMappedError(async () => {
    validateScheduleId(scheduleId);
    return getActiveLocks(scheduleId);
  });
};

const formatError = (error) => {
  const mapped = toServiceError(error);
  return {
    statusCode: mapped.statusCode,
    payload: mapped.payload,
  };
};

const isSeatLockError = (error) => (
  error instanceof SeatLockServiceError
  || error instanceof SeatLockError
  || error instanceof SeatLockValidationError
);

const getLockDurationMs = () => LOCK_TTL_MS;

module.exports = {
  SeatLockServiceError,
  lockSeats,
  validateLocks,
  releaseLocks,
  confirmBooking,
  getActiveLocks: getActiveSeatLocks,
  getLockDurationMs,
  formatError,
  isSeatLockError,
};