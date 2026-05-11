const mongoose = require("mongoose");
const { SeatLock } = require("../../modules/seatLock/seatLock.model");
const { normalizeSeats } = require("./seatLockValidator");

const toObjectIdIfValid = (value) => {
  if (!mongoose.isValidObjectId(value)) return value;
  return new mongoose.Types.ObjectId(String(value));
};

const removeExpiredLocks = async ({ scheduleId } = {}) => {
  const filter = { expiresAt: { $lte: new Date() } };
  if (scheduleId) {
    filter.scheduleId = toObjectIdIfValid(scheduleId);
  }

  const result = await SeatLock.deleteMany(filter);
  return Number(result?.deletedCount || 0);
};

const cleanupMalformedLocks = async ({ scheduleId, seats } = {}) => {
  const baseFilter = {};
  if (scheduleId) {
    baseFilter.scheduleId = toObjectIdIfValid(scheduleId);
  }
  if (Array.isArray(seats) && seats.length > 0) {
    baseFilter.seatNumber = { $in: normalizeSeats(seats) };
  }

  const malformedFilter = {
    ...baseFilter,
    $or: [
      { scheduleId: { $exists: false } },
      { scheduleId: null },
      { seatNumber: { $exists: false } },
      { seatNumber: null },
      { seatNumber: "" },
      { userId: { $exists: false } },
      { userId: null },
      { expiresAt: { $exists: false } },
      { expiresAt: null },

      // Compatibility fields from older schema versions.
      { lockedBy: { $exists: false } },
      { lockedBy: null },
      { lockedBy: "" },
    ],
  };

  const result = await SeatLock.collection.deleteMany(malformedFilter);
  return Number(result?.deletedCount || 0);
};

const startLockCleanupJob = ({ intervalMs = 60 * 1000 } = {}) => {
  const safeIntervalMs = Number.isFinite(Number(intervalMs)) && Number(intervalMs) > 0
    ? Math.trunc(Number(intervalMs))
    : 60 * 1000;

  const timer = setInterval(() => {
    // Best-effort maintenance; TTL index remains source of truth.
    void removeExpiredLocks().catch(() => {});
    void cleanupMalformedLocks().catch(() => {});
  }, safeIntervalMs);

  if (typeof timer.unref === "function") timer.unref();
  return timer;
};

module.exports = {
  removeExpiredLocks,
  cleanupMalformedLocks,
  startLockCleanupJob,
};