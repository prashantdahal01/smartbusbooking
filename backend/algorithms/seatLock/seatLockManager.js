const mongoose = require("mongoose");

const Booking = require("../../models/Booking");
const SeatLock = require("../../models/SeatLock");
const { removeExpiredLocks } = require("./lockCleanup");
const {
  SeatLockValidationError,
  normalizeSeatNumber,
  normalizeSeats,
  validateScheduleId,
} = require("./seatLockValidator");

const LOCK_TTL_MS = (() => {
  const raw = Number(process.env.SEAT_LOCK_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 5 * 60 * 1000;
})();

class SeatLockError extends Error {
  constructor(message, { statusCode = 400, code = "SEAT_LOCK_ERROR", details = {} } = {}) {
    super(message);
    this.name = "SeatLockError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

const sortSeatNumbers = (a, b) => String(a || "").localeCompare(String(b || ""), undefined, {
  numeric: true,
  sensitivity: "base",
});

const toObjectIdIfValid = (value) => {
  if (!mongoose.isValidObjectId(value)) return value;
  return new mongoose.Types.ObjectId(String(value));
};

const getSessionId = ({ sessionId, userId }) => {
  const provided = String(sessionId || "").trim();
  if (provided) return provided;
  return `user-${String(userId || "")}`;
};

const getExpiry = () => {
  const now = new Date();
  return {
    now,
    expiresAt: new Date(now.getTime() + LOCK_TTL_MS),
  };
};

const buildSeatQueryValues = (seatNumbers) => {
  const values = new Set();
  (Array.isArray(seatNumbers) ? seatNumbers : []).forEach((seatNumber) => {
    const normalized = normalizeSeatNumber(seatNumber);
    if (!normalized) return;

    values.add(normalized);
    if (/^\d+$/.test(normalized)) {
      values.add(Number(normalized));
    }
  });
  return [...values];
};

const getBookedSeats = async ({ scheduleId, seatNumbers }) => {
  const seatQueryValues = buildSeatQueryValues(seatNumbers);
  const booked = await Booking.find({
    schedule: scheduleId,
    status: "confirmed",
    seats: { $in: seatQueryValues },
  }).select("seats");

  const bookedSeatSet = new Set(
    booked
      .flatMap((entry) => (Array.isArray(entry?.seats) ? entry.seats : []))
      .map((seat) => normalizeSeatNumber(seat))
      .filter((seat) => seatNumbers.includes(seat))
  );

  return [...bookedSeatSet].sort(sortSeatNumbers);
};

const getActiveLocks = async (scheduleId) => {
  validateScheduleId(scheduleId);
  const scheduleObjectId = toObjectIdIfValid(scheduleId);
  await removeExpiredLocks({ scheduleId: scheduleObjectId });

  return SeatLock.find({
    scheduleId: scheduleObjectId,
    status: "LOCKED",
    expiresAt: { $gt: new Date() },
  }).select("scheduleId seatNumber userId sessionId status expiresAt lockedAt");
};

const lockSeats = async ({ scheduleId, seats, userId, sessionId } = {}) => {
  validateScheduleId(scheduleId);
  if (!userId) {
    throw new SeatLockValidationError("user is required", {
      code: "INVALID_LOCK_REQUEST",
    });
  }

  const scheduleObjectId = toObjectIdIfValid(scheduleId);
  const userObjectId = toObjectIdIfValid(userId);
  const seatNumbers = normalizeSeats(seats);
  const normalizedSessionId = getSessionId({ sessionId, userId });

  await removeExpiredLocks({ scheduleId: scheduleObjectId });
  await SeatLock.ensureIndexHealth();

  const alreadyBooked = await getBookedSeats({ scheduleId: scheduleObjectId, seatNumbers });
  if (alreadyBooked.length > 0) {
    throw new SeatLockError("Some seats are no longer available", {
      statusCode: 409,
      code: "SEAT_ALREADY_BOOKED",
      details: {
        failedSeats: alreadyBooked,
        bookedSeats: alreadyBooked,
      },
    });
  }

  const { now, expiresAt } = getExpiry();

  // Fail early before write attempts if locks exist for other users.
  const existingConflicts = await SeatLock.find({
    scheduleId: scheduleObjectId,
    seatNumber: { $in: seatNumbers },
    expiresAt: { $gt: now },
    userId: { $ne: userObjectId },
  }).select("seatNumber");

  if (existingConflicts.length > 0) {
    const conflictSeats = [...new Set(existingConflicts.map((lock) => normalizeSeatNumber(lock.seatNumber)))].sort(sortSeatNumbers);
    throw new SeatLockError("Some seats are no longer available", {
      statusCode: 409,
      code: "SEAT_ALREADY_LOCKED",
      details: {
        failedSeats: conflictSeats,
        conflictSeats,
      },
    });
  }

  const insertedSeats = [];
  const conflictSeats = [];

  for (const seatNumber of seatNumbers) {
    try {
      const result = await SeatLock.findOneAndUpdate(
        {
          scheduleId: scheduleObjectId,
          seatNumber,
          userId: userObjectId,
        },
        {
          $set: {
            sessionId: normalizedSessionId,
            status: "LOCKED",
            expiresAt,
            lockedAt: now,

            // Compatibility fields for older code paths.
            schedule: scheduleObjectId,
            seatLabel: seatNumber,
            lockedBy: userObjectId,
          },
          $setOnInsert: {
            scheduleId: scheduleObjectId,
            seatNumber,
            userId: userObjectId,
          },
        },
        {
          upsert: true,
          new: true,
          rawResult: true,
          setDefaultsOnInsert: true,
        }
      );

      const wasInserted = !Boolean(result?.lastErrorObject?.updatedExisting);
      if (wasInserted) insertedSeats.push(seatNumber);
    } catch (error) {
      if (error?.code !== 11000) throw error;
      conflictSeats.push(seatNumber);
    }
  }

  if (conflictSeats.length > 0) {
    if (insertedSeats.length > 0) {
      // All-or-nothing lock: rollback newly created locks on any conflict.
      await SeatLock.deleteMany({
        scheduleId: scheduleObjectId,
        seatNumber: { $in: insertedSeats },
        userId: userObjectId,
      });
    }

    const failedSeats = [...new Set(conflictSeats)].sort(sortSeatNumbers);
    throw new SeatLockError("Some seats are no longer available", {
      statusCode: 409,
      code: "SEAT_LOCK_CONFLICT",
      details: {
        failedSeats,
        conflictSeats: failedSeats,
      },
    });
  }

  return {
    success: true,
    seats: seatNumbers,
    expiresAt,
    lockDurationMs: LOCK_TTL_MS,
  };
};

const validateLocks = async ({ scheduleId, seats, userId } = {}) => {
  validateScheduleId(scheduleId);
  if (!userId) {
    throw new SeatLockValidationError("user is required", {
      code: "INVALID_LOCK_REQUEST",
    });
  }

  const seatNumbers = normalizeSeats(seats);
  const scheduleObjectId = toObjectIdIfValid(scheduleId);
  const userObjectId = toObjectIdIfValid(userId);

  await removeExpiredLocks({ scheduleId: scheduleObjectId });

  const now = new Date();
  const allLocks = await SeatLock.find({
    scheduleId: scheduleObjectId,
    seatNumber: { $in: seatNumbers },
    status: "LOCKED",
    expiresAt: { $gt: now },
  }).select("seatNumber userId expiresAt");

  const lockBySeat = new Map();
  allLocks.forEach((lock) => {
    const seatNumber = normalizeSeatNumber(lock?.seatNumber);
    if (!seatNumber || lockBySeat.has(seatNumber)) return;
    lockBySeat.set(seatNumber, lock);
  });

  const missingSeats = [];
  const conflictSeats = [];

  for (const seatNumber of seatNumbers) {
    const lock = lockBySeat.get(seatNumber);
    if (!lock) {
      missingSeats.push(seatNumber);
      continue;
    }

    if (String(lock.userId) !== String(userObjectId)) {
      conflictSeats.push(seatNumber);
    }
  }

  const valid = missingSeats.length === 0 && conflictSeats.length === 0;
  const lockExpiries = [...lockBySeat.values()]
    .filter((lock) => String(lock.userId) === String(userObjectId))
    .map((lock) => new Date(lock.expiresAt).getTime())
    .filter((value) => Number.isFinite(value));

  return {
    valid,
    missingSeats: missingSeats.sort(sortSeatNumbers),
    conflictSeats: conflictSeats.sort(sortSeatNumbers),
    expiresAt: lockExpiries.length > 0 ? new Date(Math.min(...lockExpiries)) : null,
  };
};

const releaseLocks = async ({ scheduleId, seats, userId } = {}) => {
  validateScheduleId(scheduleId);

  const scheduleObjectId = toObjectIdIfValid(scheduleId);
  const filter = {
    scheduleId: scheduleObjectId,
  };

  if (Array.isArray(seats) && seats.length > 0) {
    filter.seatNumber = { $in: normalizeSeats(seats) };
  }

  if (userId) {
    filter.userId = toObjectIdIfValid(userId);
  }

  const result = await SeatLock.deleteMany(filter);
  return {
    success: true,
    releasedCount: Number(result?.deletedCount || 0),
  };
};

const confirmBooking = async ({ scheduleId, seats, userId, confirmFn } = {}) => {
  const validation = await validateLocks({ scheduleId, seats, userId });
  if (!validation.valid) {
    throw new SeatLockError("Seat lock required before payment. Missing locks", {
      statusCode: 409,
      code: "MISSING_SEAT_LOCK",
      details: {
        missingLocks: validation.missingSeats,
        conflictSeats: validation.conflictSeats,
        failedSeats: [...validation.missingSeats, ...validation.conflictSeats].sort(sortSeatNumbers),
      },
    });
  }

  const result = typeof confirmFn === "function" ? await confirmFn() : null;
  await releaseLocks({ scheduleId, seats, userId });

  return {
    success: true,
    result,
  };
};

module.exports = {
  LOCK_TTL_MS,
  SeatLockError,
  lockSeats,
  validateLocks,
  releaseLocks,
  confirmBooking,
  getActiveLocks,

  // Compatibility exports for old imports.
  normalizeSeatNumber,
  validateSeatLocks: validateLocks,
  listActiveLocks: getActiveLocks,
};
