const test = require("node:test");
const assert = require("node:assert/strict");

const Booking = require("../../models/Booking");
const SeatLock = require("../../models/SeatLock");
const {
  SeatLockError,
  lockSeats,
  validateLocks,
  releaseLocks,
  confirmBooking,
} = require("./seatLockManager");

const originalFns = {
  bookingFind: Booking.find,
  seatLockFind: SeatLock.find,
  seatLockFindOneAndUpdate: SeatLock.findOneAndUpdate,
  seatLockDeleteMany: SeatLock.deleteMany,
  seatLockEnsureIndexHealth: SeatLock.ensureIndexHealth,
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const toComparable = (value) => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string" || typeof value === "number") {
    const asDate = new Date(value);
    if (Number.isFinite(asDate.getTime())) return asDate.getTime();
    return value;
  }
  return value;
};

const matchField = (actual, expected) => {
  if (expected && typeof expected === "object" && !Array.isArray(expected)) {
    if (Object.prototype.hasOwnProperty.call(expected, "$in")) {
      return expected.$in.includes(actual);
    }

    if (Object.prototype.hasOwnProperty.call(expected, "$ne")) {
      return String(actual) !== String(expected.$ne);
    }

    if (Object.prototype.hasOwnProperty.call(expected, "$gt")) {
      return toComparable(actual) > toComparable(expected.$gt);
    }

    if (Object.prototype.hasOwnProperty.call(expected, "$gte")) {
      return toComparable(actual) >= toComparable(expected.$gte);
    }

    if (Object.prototype.hasOwnProperty.call(expected, "$lt")) {
      return toComparable(actual) < toComparable(expected.$lt);
    }

    if (Object.prototype.hasOwnProperty.call(expected, "$lte")) {
      return toComparable(actual) <= toComparable(expected.$lte);
    }
  }

  return String(actual) === String(expected);
};

const matches = (doc, query) => {
  if (!query || typeof query !== "object") return true;

  if (Array.isArray(query.$or)) {
    return query.$or.some((orQuery) => matches(doc, orQuery));
  }

  return Object.entries(query).every(([key, expected]) => {
    if (key === "$or") return true;
    return matchField(doc[key], expected);
  });
};

const withMockDb = (seed = {}) => {
  const db = {
    bookings: clone(seed.bookings || []),
    locks: clone(seed.locks || []),
    id: 0,
  };

  Booking.find = (query) => ({
    select: async () => db.bookings.filter((doc) => matches(doc, query)),
  });

  SeatLock.find = (query) => ({
    select: async () => db.locks.filter((doc) => matches(doc, query)),
  });

  SeatLock.findOneAndUpdate = async (filter, update = {}, options = {}) => {
    const idx = db.locks.findIndex((doc) =>
      String(doc.scheduleId) === String(filter.scheduleId)
      && String(doc.seatNumber) === String(filter.seatNumber)
    );

    const now = new Date();

    if (idx >= 0) {
      const existing = db.locks[idx];
      const sameOwner = String(existing.userId) === String(filter.userId);
      if (!sameOwner) {
        const error = new Error("duplicate key");
        error.code = 11000;
        throw error;
      }

      const next = {
        ...existing,
        ...(update.$set || {}),
        updatedAt: now,
      };
      db.locks[idx] = next;
      return {
        value: next,
        lastErrorObject: { updatedExisting: true },
      };
    }

    if (!options?.upsert) return { value: null, lastErrorObject: { updatedExisting: false } };

    const created = {
      _id: `lock-${++db.id}`,
      ...(update.$setOnInsert || {}),
      ...(update.$set || {}),
      createdAt: now,
      updatedAt: now,
    };

    db.locks.push(created);

    return {
      value: created,
      lastErrorObject: { updatedExisting: false },
    };
  };

  SeatLock.deleteMany = async (filter) => {
    const before = db.locks.length;
    db.locks = db.locks.filter((doc) => !matches(doc, filter));
    return { deletedCount: before - db.locks.length };
  };

  SeatLock.ensureIndexHealth = async () => {};

  return db;
};

const restoreMocks = () => {
  Booking.find = originalFns.bookingFind;
  SeatLock.find = originalFns.seatLockFind;
  SeatLock.findOneAndUpdate = originalFns.seatLockFindOneAndUpdate;
  SeatLock.deleteMany = originalFns.seatLockDeleteMany;
  SeatLock.ensureIndexHealth = originalFns.seatLockEnsureIndexHealth;
};

test.afterEach(() => {
  restoreMocks();
});

test("two users lock same seat: only one succeeds", async () => {
  const db = withMockDb();

  const [r1, r2] = await Promise.allSettled([
    lockSeats({ scheduleId: "schedule-1", seats: ["A1"], userId: "user-1", sessionId: "session-1" }),
    lockSeats({ scheduleId: "schedule-1", seats: ["A1"], userId: "user-2", sessionId: "session-2" }),
  ]);

  const successes = [r1, r2].filter((result) => result.status === "fulfilled");
  const failures = [r1, r2].filter((result) => result.status === "rejected");

  assert.equal(successes.length, 1);
  assert.equal(failures.length, 1);
  assert.equal(db.locks.length, 1);
  assert.equal(db.locks[0].seatNumber, "A1");
});

test("expired lock is cleaned and seat becomes available", async () => {
  const db = withMockDb({
    locks: [
      {
        scheduleId: "schedule-1",
        seatNumber: "A2",
        userId: "user-old",
        sessionId: "session-old",
        status: "LOCKED",
        expiresAt: new Date(Date.now() - 30 * 1000),
        lockedAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    ],
  });

  const result = await lockSeats({ scheduleId: "schedule-1", seats: ["A2"], userId: "user-2", sessionId: "session-2" });

  assert.equal(result.success, true);
  assert.deepEqual(result.seats, ["A2"]);
  assert.equal(db.locks.length, 1);
  assert.equal(db.locks[0].userId, "user-2");
});

test("payment without lock is rejected", async () => {
  withMockDb();

  await assert.rejects(
    async () => {
      await confirmBooking({
        scheduleId: "schedule-1",
        seats: ["A3"],
        userId: "user-3",
        confirmFn: async () => ({ ok: true }),
      });
    },
    (error) => {
      assert.equal(error instanceof SeatLockError, true);
      assert.equal(error.code, "MISSING_SEAT_LOCK");
      return true;
    }
  );
});

test("lock then confirm booking succeeds and releases locks", async () => {
  const db = withMockDb();

  await lockSeats({ scheduleId: "schedule-1", seats: ["A4"], userId: "user-4", sessionId: "session-4" });

  const result = await confirmBooking({
    scheduleId: "schedule-1",
    seats: ["A4"],
    userId: "user-4",
    confirmFn: async () => ({ bookingId: "booking-1" }),
  });

  assert.equal(result.success, true);
  assert.equal(result.result.bookingId, "booking-1");
  assert.equal(db.locks.length, 0);
});

test("manual release unlocks seats on cancel", async () => {
  const db = withMockDb();

  await lockSeats({ scheduleId: "schedule-1", seats: ["A5", "A6"], userId: "user-5", sessionId: "session-5" });
  const released = await releaseLocks({ scheduleId: "schedule-1", seats: ["A5"], userId: "user-5" });

  assert.equal(released.success, true);
  assert.equal(released.releasedCount, 1);
  assert.equal(db.locks.length, 1);
  assert.equal(db.locks[0].seatNumber, "A6");
});

test("validateLocks reports conflict when seat is locked by another user", async () => {
  withMockDb();

  await lockSeats({ scheduleId: "schedule-1", seats: ["B1"], userId: "user-owner", sessionId: "session-owner" });
  const validation = await validateLocks({
    scheduleId: "schedule-1",
    seats: ["B1", "B2"],
    userId: "user-requester",
  });

  assert.equal(validation.valid, false);
  assert.deepEqual(validation.conflictSeats, ["B1"]);
  assert.deepEqual(validation.missingSeats, ["B2"]);
});
