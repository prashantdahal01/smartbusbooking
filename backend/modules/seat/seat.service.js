const mongoose = require("mongoose");
const { seatLockService } = require("../../algorithms/seatLock");
const { ApiError } = require("../../utils/apiError");
const {
  SeatLock,
  Booking,
  Schedule,
  Bus,
} = require("./seat.model");
const {
  buildSeatCatalog,
  buildSeatQueryValues,
  parseSeats,
  normalizeSeatLabel,
} = require("./seat.utils");

const toObjectId = (value) => (mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : null);

const mapSeatLockError = (error) => {
  const formatted = seatLockService.formatError(error);
  throw new ApiError(formatted.statusCode, formatted.payload?.message || "Seat lock failed", formatted.payload);
};

const getSeatLayout = async (busId) => {
  const parsedId = toObjectId(busId);
  if (!parsedId) {
    throw new ApiError(400, "Invalid bus id", { busId });
  }

  const bus = await Bus.findById(parsedId).lean();
  if (!bus) {
    throw new ApiError(404, "Bus not found", { busId });
  }

  return {
    busId: String(bus._id),
    name: bus.name,
    totalSeats: bus.totalSeats || 0,
    decks: Array.isArray(bus.decks) ? bus.decks : [],
  };
};

const getSeatAvailability = async ({ scheduleId }) => {
  const parsedId = toObjectId(scheduleId);
  if (!parsedId) {
    throw new ApiError(400, "Invalid schedule id", { scheduleId });
  }

  const schedule = await Schedule.findById(parsedId).populate("bus").lean();
  if (!schedule) {
    throw new ApiError(404, "Schedule not found", { scheduleId });
  }
  if (!schedule.bus) {
    throw new ApiError(400, "Schedule bus not configured", { scheduleId });
  }

  const seatCatalog = buildSeatCatalog(schedule.bus, schedule?.price);
  const seatLabels = [...seatCatalog.keys()];
  const seatQueryValues = buildSeatQueryValues(seatLabels);

  const [bookings, activeLocks] = await Promise.all([
    Booking.find({ schedule: parsedId, status: "confirmed", seats: { $in: seatQueryValues } }).select("seats").lean(),
    SeatLock.find({ scheduleId: parsedId, status: "LOCKED", expiresAt: { $gt: new Date() } }).select("seatNumber").lean(),
  ]);

  const bookedSet = new Set();
  bookings.forEach((booking) => {
    (Array.isArray(booking?.seats) ? booking.seats : [])
      .map((seat) => normalizeSeatLabel(seat))
      .filter(Boolean)
      .forEach((seat) => bookedSet.add(seat));
  });

  const lockedSet = new Set();
  activeLocks.forEach((lock) => {
    const seat = normalizeSeatLabel(lock?.seatNumber);
    if (seat) lockedSet.add(seat);
  });

  const seats = seatLabels.map((label) => {
    let status = "AVAILABLE";
    if (bookedSet.has(label)) status = "BOOKED";
    else if (lockedSet.has(label)) status = "LOCKED";

    const catalogSeat = seatCatalog.get(label);
    return {
      seatLabel: label,
      seatNumber: catalogSeat?.seatNumber || label,
      deckNumber: catalogSeat?.deckNumber,
      deckName: catalogSeat?.deckName,
      seatType: catalogSeat?.seatType,
      price: catalogSeat?.price,
      status,
    };
  });

  return {
    scheduleId: String(schedule._id),
    busId: String(schedule?.bus?._id || ""),
    seats,
    bookedSeats: [...bookedSet].sort(),
    lockedSeats: [...lockedSet].sort(),
    availableSeats: seats.filter((seat) => seat.status === "AVAILABLE").map((seat) => seat.seatLabel),
  };
};

const lockSeats = async ({ scheduleId, seats, userId, sessionId }) => {
  const normalizedSeats = parseSeats(seats);
  if (!scheduleId || !normalizedSeats) {
    throw new ApiError(400, "scheduleId and seats[] are required", { scheduleId, seats });
  }
  if (!userId) {
    throw new ApiError(401, "Unauthorized", null);
  }

  try {
    return await seatLockService.lockSeats({
      scheduleId,
      seats: normalizedSeats,
      userId,
      sessionId,
    });
  } catch (error) {
    return mapSeatLockError(error);
  }
};

const validateLocks = async ({ scheduleId, seats, userId }) => {
  const normalizedSeats = parseSeats(seats);
  if (!scheduleId || !normalizedSeats) {
    throw new ApiError(400, "scheduleId and seats[] are required", { scheduleId, seats });
  }
  if (!userId) {
    throw new ApiError(401, "Unauthorized", null);
  }

  try {
    return await seatLockService.validateLocks({
      scheduleId,
      seats: normalizedSeats,
      userId,
    });
  } catch (error) {
    return mapSeatLockError(error);
  }
};

const releaseLocks = async ({ scheduleId, seats, userId }) => {
  const normalizedSeats = parseSeats(seats);
  if (!scheduleId || !normalizedSeats) {
    throw new ApiError(400, "scheduleId and seats[] are required", { scheduleId, seats });
  }
  if (!userId) {
    throw new ApiError(401, "Unauthorized", null);
  }

  try {
    return await seatLockService.releaseLocks({
      scheduleId,
      seats: normalizedSeats,
      userId,
    });
  } catch (error) {
    return mapSeatLockError(error);
  }
};

module.exports = {
  getSeatLayout,
  getSeatAvailability,
  lockSeats,
  validateLocks,
  releaseLocks,
};
