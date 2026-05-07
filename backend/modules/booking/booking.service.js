const { seatLockService } = require("../../algorithms/seatLock");
const { generateTicketPdfBuffer } = require("../../utils/ticketPdf");
const { createAdminNotification } = require("../../services/notification.service");
const { buildRouteOrderIndex } = require("../../utils/routePoints");
const {
  BOOKING_STATUS,
  PAYMENT_STATUS,
  normalizeBookingDocument,
  isPendingBooking,
  isRetryablePendingBooking,
} = require("../../utils/bookingState");
const { ApiError } = require("../../utils/apiError");
const { Booking, Bus, Schedule, SeatLock } = require("./booking.model");
const seatService = require("../seat/seat.service");
const {
  DEFAULT_SEAT_PRICE,
  normalizeSeatLabel,
  sortSeatLabels,
  buildSeatQueryValues,
  buildSeatCatalog,
  validateSeatSelection,
  buildSeatPriceBreakdown,
  parseSeats,
  toFinitePrice,
} = require("../seat/seat.utils");
const {
  parsePassenger,
  parsePassengers,
  pickSchedulePoint,
  parseIsoDateTimeMs,
  parseDateStartMs,
  getTodayStartMs,
  stopKey,
} = require("./booking.utils");

const seatLockError = (error) => {
  const formatted = seatLockService.formatError(error);
  throw new ApiError(formatted.statusCode, formatted.payload?.message || "Seat lock error", formatted.payload);
};

const getBookingScheduleId = (booking) => booking?.schedule?._id || booking?.schedule;

const toSeatLockKey = (scheduleId, seatLabel) => {
  return `${String(scheduleId || "")}::${normalizeSeatLabel(seatLabel)}`;
};

const normalizeAndPersistBookingState = async (booking) => {
  const normalized = normalizeBookingDocument(booking);
  if (normalized.changed) {
    await booking.save();
  }
  return normalized;
};

const buildActiveLockIndex = async ({ userId, scheduleIds }) => {
  const safeScheduleIds = [...new Set((Array.isArray(scheduleIds) ? scheduleIds : [])
    .map((id) => String(id || "").trim())
    .filter(Boolean))];
  if (!userId || safeScheduleIds.length === 0) return new Map();

  const activeLocks = await SeatLock.find({
    userId,
    scheduleId: { $in: safeScheduleIds },
    status: "LOCKED",
    expiresAt: { $gt: new Date() },
  }).select("scheduleId seatNumber expiresAt");

  const lockIndex = new Map();
  activeLocks.forEach((lock) => {
    const key = toSeatLockKey(lock?.scheduleId, lock?.seatNumber);
    const expiresAtMs = new Date(lock?.expiresAt || 0).getTime();
    if (!key || !Number.isFinite(expiresAtMs)) return;

    const current = lockIndex.get(key);
    if (!Number.isFinite(current) || expiresAtMs < current) {
      lockIndex.set(key, expiresAtMs);
    }
  });

  return lockIndex;
};

const resolveBookingLockWindow = (booking, lockIndex) => {
  const scheduleId = getBookingScheduleId(booking);
  const seats = Array.isArray(booking?.seats)
    ? booking.seats.map((seat) => normalizeSeatLabel(seat)).filter(Boolean)
    : [];
  if (!scheduleId || seats.length === 0) {
    return { hasAllLocks: false, expiresAtMs: NaN, seats: [] };
  }

  const expiries = [];
  for (const seat of seats) {
    const expiresAtMs = Number(lockIndex.get(toSeatLockKey(scheduleId, seat)));
    if (!Number.isFinite(expiresAtMs)) {
      return { hasAllLocks: false, expiresAtMs: NaN, seats };
    }
    expiries.push(expiresAtMs);
  }

  return {
    hasAllLocks: true,
    expiresAtMs: Math.min(...expiries),
    seats,
  };
};

const markPendingBookingExpired = async (booking) => {
  booking.status = BOOKING_STATUS.CANCELLED;
  booking.payment = booking.payment || { provider: "esewa" };
  booking.payment.status = PAYMENT_STATUS.FAILED;
  booking.payment.gatewayStatus = booking.payment.gatewayStatus || "LOCK_EXPIRED";
  await booking.save();

  await seatLockService.releaseLocks({
    scheduleId: getBookingScheduleId(booking),
    seats: booking?.seats,
    allowEmptySeats: true,
  }).catch(() => {});
};

const toClientBooking = ({ booking, bookingState, lockWindow, nowMs }) => {
  const plain = booking?.toObject ? booking.toObject() : booking;
  const payment = plain?.payment && typeof plain.payment === "object" ? plain.payment : {};

  const lockExpiresAtMs = Number(lockWindow?.expiresAtMs);
  const hasActiveLock = lockWindow?.hasAllLocks && Number.isFinite(lockExpiresAtMs) && lockExpiresAtMs > nowMs;
  const retryEligible = hasActiveLock && isRetryablePendingBooking(bookingState || {});

  return {
    ...plain,
    status: bookingState?.bookingStatus || BOOKING_STATUS.PENDING,
    payment: {
      ...payment,
      status: bookingState?.paymentStatus || PAYMENT_STATUS.PENDING,
    },
    paymentStatus: bookingState?.paymentStatus || PAYMENT_STATUS.PENDING,
    lockExpiresAt: hasActiveLock ? new Date(lockExpiresAtMs).toISOString() : null,
    lockRemainingMs: hasActiveLock ? Math.max(0, lockExpiresAtMs - nowMs) : 0,
    retryEligible,
  };
};

const lockSeats = async ({ scheduleId, seats, userId, sessionId }) => {
  return seatService.lockSeats({ scheduleId, seats, userId, sessionId });
};

const unlockSeats = async ({ scheduleId, seats, userId }) => {
  return seatService.releaseLocks({ scheduleId, seats, userId });
};

const createBooking = async ({ userId, body }) => {
  if (String(process.env.REQUIRE_ONLINE_PAYMENT || "true").toLowerCase() !== "false") {
    throw new ApiError(400, "Online payment required. Use eSewa payment from the booking page.", null);
  }

  const { scheduleId, seats } = body || {};
  const normalizedSeats = parseSeats(seats);
  if (!scheduleId || !normalizedSeats) {
    throw new ApiError(400, "scheduleId and seats[] are required", null);
  }

  const passenger = parsePassenger(body?.passenger);
  if (!passenger) {
    throw new ApiError(400, "passenger{name,age,gender,phone} is required", null);
  }

  const passengersResult = parsePassengers({
    passengers: body?.passengers,
    seatLabels: normalizedSeats,
    fallbackPassenger: passenger,
  });
  if (!passengersResult.ok) {
    throw new ApiError(400, passengersResult.message, null);
  }
  const passengers = passengersResult.value;

  const boardingPointName = String(body?.boardingPoint || "").trim();
  const droppingPointName = String(body?.droppingPoint || "").trim();
  if (!boardingPointName || !droppingPointName) {
    throw new ApiError(400, "boardingPoint and droppingPoint are required", null);
  }
  if (stopKey(boardingPointName) === stopKey(droppingPointName)) {
    throw new ApiError(400, "Dropping point must be different from boarding point", null);
  }

  const schedule = await Schedule.findById(scheduleId).populate("bus").populate("route");
  if (!schedule) throw new ApiError(404, "Schedule not found", null);
  if (!schedule.route) throw new ApiError(400, "Schedule route missing", null);
  if (!schedule.bus) throw new ApiError(400, "Schedule bus not configured", null);
  if (schedule?.isActive === false) {
    throw new ApiError(400, "Schedule is no longer active", null);
  }
  if (schedule?.bus?.isActive === false) {
    throw new ApiError(400, "Selected bus is no longer available", null);
  }

  const scheduleDateMs = parseDateStartMs(schedule?.date);
  if (!Number.isFinite(scheduleDateMs)) {
    throw new ApiError(400, "Schedule travel date is invalid", null);
  }
  if (scheduleDateMs < getTodayStartMs()) {
    throw new ApiError(400, "Cannot book past schedules", null);
  }

  const selectedBoardingPoint = pickSchedulePoint(schedule.boardingPoints, boardingPointName);
  if (!selectedBoardingPoint) {
    throw new ApiError(400, "Invalid boarding point", null);
  }
  const selectedDroppingPoint = pickSchedulePoint(schedule.droppingPoints, droppingPointName);
  if (!selectedDroppingPoint) {
    throw new ApiError(400, "Invalid dropping point", null);
  }

  const boardingOrder = Number(selectedBoardingPoint?.order);
  const droppingOrder = Number(selectedDroppingPoint?.order);

  if (Number.isFinite(boardingOrder) && Number.isFinite(droppingOrder)) {
    if (droppingOrder <= boardingOrder) {
      throw new ApiError(400, "Dropping point must be after boarding point", null);
    }
  } else {
    const routeOrderIndex = buildRouteOrderIndex(schedule.route || {});
    const bIdx = routeOrderIndex.get(stopKey(selectedBoardingPoint.name));
    const dIdx = routeOrderIndex.get(stopKey(selectedDroppingPoint.name));
    if (bIdx === undefined || dIdx === undefined) {
      throw new ApiError(400, "Selected points must exist in the route stop list", null);
    }
    if (dIdx <= bIdx) {
      throw new ApiError(400, "Dropping point must be after boarding point", null);
    }
  }

  const boardingMs = parseIsoDateTimeMs(selectedBoardingPoint.date, selectedBoardingPoint.time);
  const droppingMs = parseIsoDateTimeMs(selectedDroppingPoint.date, selectedDroppingPoint.time);
  if (!Number.isFinite(boardingMs) || !Number.isFinite(droppingMs)) {
    throw new ApiError(400, "Selected points must have valid date and time", null);
  }
  if (droppingMs <= boardingMs) {
    throw new ApiError(400, "Dropping time must be after boarding time", null);
  }

  const scheduleFallbackPrice = toFinitePrice(schedule?.price, DEFAULT_SEAT_PRICE);
  const seatCatalog = buildSeatCatalog(schedule.bus, scheduleFallbackPrice);
  if (seatCatalog.size <= 0) {
    throw new ApiError(400, "No seat layout configured for this bus", null);
  }

  const { invalidSeats, unavailableSeats } = validateSeatSelection(seatCatalog, normalizedSeats);
  if (invalidSeats.length > 0) {
    throw new ApiError(400, "One or more seats are invalid", { invalidSeats });
  }
  if (unavailableSeats.length > 0) {
    throw new ApiError(400, "One or more seats are currently unavailable", { unavailableSeats });
  }

  const seatQueryValues = buildSeatQueryValues(normalizedSeats);

  const alreadyBooked = await Booking.find({
    schedule: scheduleId,
    status: "confirmed",
    seats: { $in: seatQueryValues },
  }).select("_id seats");

  if (alreadyBooked.length > 0) {
    const bookedSeats = [...new Set(
      alreadyBooked
        .flatMap((b) => (Array.isArray(b?.seats) ? b.seats : []))
        .map((seat) => normalizeSeatLabel(seat))
        .filter((seat) => normalizedSeats.includes(seat))
    )].sort(sortSeatLabels);
    throw new ApiError(409, "Some seats already booked", { bookedSeats });
  }

  const lockValidation = await seatLockService.validateLocks({
    scheduleId,
    seats: normalizedSeats,
    userId,
  });
  if (!lockValidation.valid) {
    const missingLocks = [...lockValidation.missingLocks, ...lockValidation.conflictSeats].sort(sortSeatLabels);
    throw new ApiError(409, "Seat lock required before booking", {
      missingLocks,
      failedSeats: missingLocks,
    });
  }

  const seatPriceBreakdown = buildSeatPriceBreakdown(normalizedSeats, seatCatalog);
  const totalPrice = seatPriceBreakdown.reduce((sum, seat) => sum + toFinitePrice(seat.price), 0);
  const pricePerSeat = normalizedSeats.length > 0 ? Number((totalPrice / normalizedSeats.length).toFixed(2)) : 0;

  try {
    const bookingResult = await seatLockService.confirmBooking({
      scheduleId,
      seats: normalizedSeats,
      userId,
      confirmFn: () => Booking.create({
        user: userId,
        schedule: scheduleId,
        passenger,
        passengers,
        boardingPoint: selectedBoardingPoint,
        droppingPoint: selectedDroppingPoint,
        seats: normalizedSeats,
        seatPriceBreakdown,
        pricePerSeat,
        totalPrice,
        status: "confirmed",
      }),
    });

    const booking = bookingResult.result;

    await createAdminNotification({
      type: "booking",
      title: "New booking received",
      message: `${passenger.name} booked ${normalizedSeats.length} seat(s) on ${schedule.route?.source || "Unknown"} -> ${schedule.route?.destination || "Unknown"}.`,
      entityType: "booking",
      entityId: booking._id,
      data: {
        bookingId: String(booking._id),
        route: `${schedule.route?.source || "Unknown"} -> ${schedule.route?.destination || "Unknown"}`,
        seats: normalizedSeats,
      },
    });

    return booking;
  } catch (error) {
    seatLockError(error);
  }
};

const getOperatorBookings = async ({ operatorId, query = {} }) => {
  const safeOperatorId = String(operatorId || "").trim();
  if (!safeOperatorId) {
    throw new ApiError(401, "Unauthorized", null);
  }

  const dateFilter = String(query?.date || "").trim();
  const scheduleFilter = String(query?.schedule || query?.scheduleId || "").trim();

  if (scheduleFilter && !/^[a-f\d]{24}$/i.test(scheduleFilter)) {
    throw new ApiError(400, "Invalid schedule id", null);
  }

  const buses = await Bus.find({ operator: safeOperatorId })
    .select("_id name vehicleNumber")
    .lean();

  if (buses.length === 0) {
    return {
      items: [],
      summary: {
        totalBookings: 0,
        totalRevenue: 0,
        paidCount: 0,
        cancelledCount: 0,
        byBus: [],
        byDay: [],
      },
      availableSchedules: [],
    };
  }

  const busIds = buses.map((bus) => bus._id);
  const scheduleMatch = { bus: { $in: busIds } };

  if (dateFilter) {
    scheduleMatch.date = dateFilter;
  }
  if (scheduleFilter) {
    scheduleMatch._id = scheduleFilter;
  }

  const schedules = await Schedule.find(scheduleMatch)
    .select("_id bus route date time arrivalDate arrivalTime isActive")
    .populate("route", "source destination")
    .populate("bus", "name vehicleNumber")
    .sort({ date: -1, time: -1 })
    .lean();

  const scheduleIds = schedules.map((schedule) => schedule._id);
  if (scheduleIds.length === 0) {
    return {
      items: [],
      summary: {
        totalBookings: 0,
        totalRevenue: 0,
        paidCount: 0,
        cancelledCount: 0,
        byBus: [],
        byDay: [],
      },
      availableSchedules: schedules.map((schedule) => ({
        id: String(schedule._id),
        date: schedule.date,
        time: schedule.time,
        route: `${String(schedule?.route?.source || "Unknown").trim()} -> ${String(schedule?.route?.destination || "Unknown").trim()}`,
        busName: String(schedule?.bus?.name || "").trim(),
        isActive: schedule?.isActive !== false,
      })),
    };
  }

  const bookings = await Booking.find({ schedule: { $in: scheduleIds } })
    .sort({ createdAt: -1 })
    .populate("user", "name email phone")
    .populate({
      path: "schedule",
      select: "date time arrivalDate arrivalTime route bus",
      populate: [
        { path: "route", select: "source destination" },
        { path: "bus", select: "name vehicleNumber" },
      ],
    })
    .lean();

  const revenueByBus = new Map();
  const revenueByDay = new Map();
  let totalRevenue = 0;
  let paidCount = 0;
  let cancelledCount = 0;

  const items = bookings.map((booking) => {
    const bookingState = normalizeBookingDocument(booking);
    const routeSource = String(booking?.schedule?.route?.source || "Unknown").trim();
    const routeDestination = String(booking?.schedule?.route?.destination || "Unknown").trim();
    const routeLabel = `${routeSource} -> ${routeDestination}`;

    const busName = String(booking?.schedule?.bus?.name || "-").trim() || "-";
    const bookingStatus = bookingState.bookingStatus;
    const paymentStatus = bookingState.paymentStatus;

    const seats = Array.isArray(booking?.seats) ? booking.seats : [];
    const totalPrice = Number(booking?.totalPrice);
    const perSeatPrice = Number(booking?.pricePerSeat);
    const amount = Number.isFinite(totalPrice)
      ? totalPrice
      : (Number.isFinite(perSeatPrice) ? perSeatPrice * seats.length : 0);

    const passengerNames = [
      String(booking?.passenger?.name || "").trim(),
      ...(Array.isArray(booking?.passengers) ? booking.passengers.map((p) => String(p?.name || "").trim()) : []),
    ]
      .filter(Boolean)
      .filter((name, idx, arr) => arr.indexOf(name) === idx);

    const primaryPassenger = passengerNames[0]
      || String(booking?.user?.name || "").trim()
      || String(booking?.user?.email || "Guest").trim();

    const isRevenueBooking = bookingStatus === BOOKING_STATUS.CONFIRMED && paymentStatus === PAYMENT_STATUS.PAID;
    if (isRevenueBooking) {
      totalRevenue += amount;
      paidCount += 1;

      const busRevenue = revenueByBus.get(busName) || { busName, bookings: 0, revenue: 0 };
      busRevenue.bookings += 1;
      busRevenue.revenue += amount;
      revenueByBus.set(busName, busRevenue);

      const dayKey = String(booking?.schedule?.date || "").trim()
        || (booking?.createdAt ? new Date(booking.createdAt).toISOString().slice(0, 10) : "");
      if (dayKey) {
        const dayRevenue = revenueByDay.get(dayKey) || { date: dayKey, bookings: 0, revenue: 0 };
        dayRevenue.bookings += 1;
        dayRevenue.revenue += amount;
        revenueByDay.set(dayKey, dayRevenue);
      }
    } else {
      cancelledCount += 1;
    }

    return {
      id: String(booking?._id || ""),
      scheduleId: String(booking?.schedule?._id || ""),
      route: routeLabel,
      busName,
      scheduleDate: booking?.schedule?.date || null,
      scheduleTime: booking?.schedule?.time || null,
      passengerName: primaryPassenger,
      passengerNames,
      passengerCount: passengerNames.length > 0 ? passengerNames.length : Math.max(seats.length, 1),
      phone: String(booking?.passenger?.phone || booking?.user?.phone || "").trim() || "-",
      seats,
      boardingPoint: String(booking?.boardingPoint?.name || "").trim() || "-",
      droppingPoint: String(booking?.droppingPoint?.name || "").trim() || "-",
      status: bookingStatus,
      paymentStatus,
      amount,
      bookedAt: booking?.createdAt || null,
    };
  });

  const byBus = [...revenueByBus.values()]
    .map((row) => ({ ...row, revenue: Number(row.revenue.toFixed(2)) }))
    .sort((a, b) => b.revenue - a.revenue || a.busName.localeCompare(b.busName));

  const byDay = [...revenueByDay.values()]
    .map((row) => ({ ...row, revenue: Number(row.revenue.toFixed(2)) }))
    .sort((a, b) => a.date.localeCompare(b.date));

  const availableSchedules = schedules.map((schedule) => ({
    id: String(schedule._id),
    date: schedule.date,
    time: schedule.time,
    route: `${String(schedule?.route?.source || "Unknown").trim()} -> ${String(schedule?.route?.destination || "Unknown").trim()}`,
    busName: String(schedule?.bus?.name || "").trim(),
    isActive: schedule?.isActive !== false,
  }));

  return {
    items,
    summary: {
      totalBookings: items.length,
      totalRevenue: Number(totalRevenue.toFixed(2)),
      paidCount,
      cancelledCount,
      byBus,
      byDay,
    },
    availableSchedules,
  };
};

const getMyBookings = async ({ userId }) => {
  const bookings = await Booking.find({ user: userId })
    .sort({ createdAt: -1 })
    .populate({ path: "schedule", populate: [{ path: "bus" }, { path: "route" }] });

  const bookingStateById = new Map();
  const pendingScheduleIds = new Set();

  for (const booking of bookings) {
    const bookingId = String(booking?._id || "");
    const bookingState = await normalizeAndPersistBookingState(booking);
    bookingStateById.set(bookingId, bookingState);

    if (isPendingBooking(bookingState)) {
      const scheduleId = String(getBookingScheduleId(booking) || "").trim();
      if (scheduleId) pendingScheduleIds.add(scheduleId);
    }
  }

  const lockIndex = await buildActiveLockIndex({
    userId,
    scheduleIds: [...pendingScheduleIds],
  });

  const lockWindowByBookingId = new Map();
  for (const booking of bookings) {
    const bookingId = String(booking?._id || "");
    const bookingState = bookingStateById.get(bookingId);
    if (!isPendingBooking(bookingState)) continue;

    const lockWindow = resolveBookingLockWindow(booking, lockIndex);
    const hasActiveLock = lockWindow.hasAllLocks
      && Number.isFinite(lockWindow.expiresAtMs)
      && lockWindow.expiresAtMs > Date.now();

    if (!hasActiveLock) {
      await markPendingBookingExpired(booking);
      bookingStateById.set(bookingId, {
        changed: false,
        bookingStatus: BOOKING_STATUS.CANCELLED,
        paymentStatus: PAYMENT_STATUS.FAILED,
      });
      continue;
    }

    lockWindowByBookingId.set(bookingId, lockWindow);
  }

  const nowMs = Date.now();
  return bookings.map((booking) => {
    const bookingId = String(booking?._id || "");
    const bookingState = bookingStateById.get(bookingId);
    const lockWindow = lockWindowByBookingId.get(bookingId);

    return toClientBooking({
      booking,
      bookingState,
      lockWindow,
      nowMs,
    });
  });
};

const getBookingById = async ({ bookingId, user }) => {
  const booking = await Booking.findById(bookingId).populate({
    path: "schedule",
    populate: [{ path: "bus" }, { path: "route" }],
  });
  if (!booking) throw new ApiError(404, "Not found", null);
  if (booking.user.toString() !== String(user?.id || "") && user?.role !== "admin") {
    throw new ApiError(403, "Forbidden", null);
  }

  const bookingState = await normalizeAndPersistBookingState(booking);
  let lockWindow;

  if (isPendingBooking(bookingState)) {
    const lockIndex = await buildActiveLockIndex({
      userId: booking.user,
      scheduleIds: [String(getBookingScheduleId(booking) || "").trim()],
    });

    const resolvedLockWindow = resolveBookingLockWindow(booking, lockIndex);
    const hasActiveLock = resolvedLockWindow.hasAllLocks
      && Number.isFinite(resolvedLockWindow.expiresAtMs)
      && resolvedLockWindow.expiresAtMs > Date.now();

    if (!hasActiveLock) {
      await markPendingBookingExpired(booking);
      bookingState.bookingStatus = BOOKING_STATUS.CANCELLED;
      bookingState.paymentStatus = PAYMENT_STATUS.FAILED;
    } else {
      lockWindow = resolvedLockWindow;
    }
  }

  return toClientBooking({
    booking,
    bookingState,
    lockWindow,
    nowMs: Date.now(),
  });
};

const getTicketPdf = async ({ bookingId, user }) => {
  const booking = await Booking.findById(bookingId).populate({
    path: "schedule",
    populate: [{ path: "bus" }, { path: "route" }],
  });
  if (!booking) throw new ApiError(404, "Not found", null);
  if (booking.user.toString() !== String(user?.id || "") && user?.role !== "admin") {
    throw new ApiError(403, "Forbidden", null);
  }
  if (booking.status !== "confirmed") {
    throw new ApiError(400, "Ticket is available after confirmation", null);
  }

  const pdf = await generateTicketPdfBuffer(booking);
  const filename = `ticket-${booking._id}.pdf`;
  return { pdf, filename };
};

const cancelBooking = async ({ bookingId, user }) => {
  const booking = await Booking.findById(bookingId).populate({
    path: "schedule",
    populate: [{ path: "bus", select: "operator" }],
  });
  if (!booking) throw new ApiError(404, "Not found", null);

  if (user?.role !== "admin") {
    throw new ApiError(403, "Only admin can cancel bookings", null);
  }

  if (booking.status === "cancelled") {
    return { message: "Already cancelled" };
  }

  booking.status = "cancelled";
  if (booking.payment && booking.payment.status !== PAYMENT_STATUS.PAID) {
    booking.payment.status = PAYMENT_STATUS.FAILED;
  }
  await booking.save();

  await createAdminNotification({
    type: "cancellation",
    title: "Booking cancelled",
    message: `Booking ${String(booking._id)} has been cancelled.`,
    entityType: "booking",
    entityId: booking._id,
    data: {
      bookingId: String(booking._id),
      status: "cancelled",
    },
  });

  return { message: "Cancelled" };
};

module.exports = {
  lockSeats,
  unlockSeats,
  createBooking,
  getOperatorBookings,
  getMyBookings,
  getBookingById,
  getTicketPdf,
  cancelBooking,
};
