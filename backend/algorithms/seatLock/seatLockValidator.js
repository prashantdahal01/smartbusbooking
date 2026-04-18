class SeatLockValidationError extends Error {
  constructor(message, { statusCode = 400, code = "INVALID_LOCK_REQUEST", details = {} } = {}) {
    super(message);
    this.name = "SeatLockValidationError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

const normalizeSeatNumber = (value) => String(value == null ? "" : value).trim().toUpperCase().replace(/\s+/g, "");

const sortSeatNumbers = (a, b) => String(a || "").localeCompare(String(b || ""), undefined, {
  numeric: true,
  sensitivity: "base",
});

const validateScheduleId = (scheduleId) => {
  const normalized = String(scheduleId || "").trim();
  if (!normalized) {
    throw new SeatLockValidationError("scheduleId is required", {
      code: "INVALID_SCHEDULE_ID",
    });
  }
  return normalized;
};

const normalizeSeats = (seats) => {
  if (!Array.isArray(seats) || seats.length === 0) {
    throw new SeatLockValidationError("seats[] is required", {
      code: "INVALID_SEAT_LIST",
    });
  }

  const normalized = seats
    .map((seat) => normalizeSeatNumber(seat))
    .filter(Boolean);

  if (normalized.length !== seats.length || normalized.length === 0) {
    throw new SeatLockValidationError("One or more selected seats are invalid", {
      code: "INVALID_SEAT_LIST",
    });
  }

  return [...new Set(normalized)].sort(sortSeatNumbers);
};

const validateLockPayload = ({ scheduleId, seats } = {}) => {
  validateScheduleId(scheduleId);
  normalizeSeats(seats);
};

module.exports = {
  SeatLockValidationError,
  normalizeSeatNumber,
  normalizeSeats,
  validateScheduleId,
  validateLockPayload,
};