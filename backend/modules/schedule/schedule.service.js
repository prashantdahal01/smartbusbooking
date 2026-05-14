const mongoose = require("mongoose");
const { ApiError } = require("../../utils/apiError");
const { seatLockService } = require("../../algorithms/seatLock");
const { routePlanningService } = require("../../algorithms/routePlanning");
const { routeSegmentService } = require("../../algorithms/routeSegment");
const { buildRouteOrderIndex, buildRoutePath, getRoutePointLanes } = require("../../utils/routePoints");
const { Schedule } = require("./schedule.model");
const { Bus } = require("../bus/bus.model");
const { Route } = require("../route/route.model");
const { Booking } = require("../booking/booking.model");

const DEFAULT_SEAT_PRICE = 0;

const normalizeSeatLabel = (value) => String(value || "").trim().toUpperCase().replace(/\s+/g, "");
const normalizeSeatType = (value) => {
  const normalized = String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized === "SLEEPER") return "SLEEPER";
  if (normalized === "SHARED_SLEEPER") return "SHARED_SLEEPER";
  return "SEATER";
};
const toFinitePrice = (value, fallbackValue = DEFAULT_SEAT_PRICE) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallbackValue;
};
const sortSeatLabels = (a, b) => String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });

const defaultDeckName = (deckNumber) => {
  if (deckNumber === 1) return "Lower Deck";
  if (deckNumber === 2) return "Upper Deck";
  return `Deck ${deckNumber}`;
};

const buildLegacyDeckLayout = (totalSeats, fallbackPrice) => {
  const safeSeatCount = Number.isFinite(Number(totalSeats)) && Number(totalSeats) > 0 ? Math.trunc(Number(totalSeats)) : 0;
  const seats = Array.from({ length: safeSeatCount }, (_, idx) => {
    const seatLabel = String(idx + 1);
    return {
      seatLabel,
      seatNumber: seatLabel,
      seatType: "SEATER",
      price: toFinitePrice(fallbackPrice),
      isAvailable: true,
      row: Math.floor(idx / 4) + 1,
      column: (idx % 4) + 1,
      deckNumber: 1,
      deckName: "Main Deck",
    };
  });

  return [{ deckNumber: 1, deckName: "Main Deck", seats }];
};

const buildSeatLayoutFromBus = (bus, fallbackPrice) => {
  const rawDecks = Array.isArray(bus?.decks) ? bus.decks : [];
  let seatLayout = [];

  if (rawDecks.length > 0) {
    seatLayout = rawDecks
      .map((deck, deckIdx) => {
        const deckNumber = Number.isFinite(Number(deck?.deckNumber)) && Number(deck.deckNumber) > 0
          ? Math.trunc(Number(deck.deckNumber))
          : deckIdx + 1;
        const deckName = String(deck?.name || "").trim() || defaultDeckName(deckNumber);
        const rawSeats = Array.isArray(deck?.seats) ? deck.seats : [];
        const normalizedSeats = rawSeats
          .map((seat, seatIdx) => {
            const seatLabel = normalizeSeatLabel(seat?.seatNumber);
            if (!seatLabel) return null;
            const seatType = normalizeSeatType(seat?.seatType);
            const price = toFinitePrice(seat?.price, fallbackPrice);
            const row = Number.isFinite(Number(seat?.row)) && Number(seat.row) > 0 ? Math.trunc(Number(seat.row)) : Math.floor(seatIdx / 4) + 1;
            const column = Number.isFinite(Number(seat?.column)) && Number(seat.column) > 0 ? Math.trunc(Number(seat.column)) : (seatIdx % 4) + 1;

            return {
              seatLabel,
              seatNumber: String(seat?.seatNumber || seatLabel).trim() || seatLabel,
              seatType,
              price,
              isAvailable: seat?.isAvailable !== false,
              row,
              column,
              deckNumber,
              deckName,
            };
          })
          .filter(Boolean)
          .sort((a, b) => {
            if (a.row !== b.row) return a.row - b.row;
            if (a.column !== b.column) return a.column - b.column;
            return sortSeatLabels(a.seatLabel, b.seatLabel);
          });

        return {
          deckNumber,
          deckName,
          seats: normalizedSeats,
        };
      })
      .sort((a, b) => a.deckNumber - b.deckNumber);
  }

  if (seatLayout.length === 0) {
    seatLayout = buildLegacyDeckLayout(bus?.totalSeats, fallbackPrice);
  }

  const seatCatalog = new Map();
  let totalSeats = 0;

  seatLayout.forEach((deck) => {
    deck.seats.forEach((seat) => {
      seatCatalog.set(seat.seatLabel, seat);
      totalSeats += 1;
    });
  });

  return { seatLayout, seatCatalog, totalSeats };
};

const normalizeText = (value) => String(value || "").trim();
const normalizeKey = (value) => normalizeText(value).toLowerCase();
const shouldIncludeRoutePlan = (value) => {
  const normalized = normalizeKey(value);
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const DAY_MINUTES = 24 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;

const isValidDateYYYYMMDD = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
const isValidTimeHHmm = (value) => /^\d{2}:\d{2}$/.test(String(value || "").trim());

const parseTimeToMinutes = (value) => {
  const text = String(value || "").trim();
  if (!isValidTimeHHmm(text)) return null;
  const [hoursRaw, minutesRaw] = text.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return (hours * 60) + minutes;
};

const pad2 = (value) => String(value).padStart(2, "0");

const toLocalDateString = (ms) => {
  const date = new Date(ms);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

const toTimeStringFromMinutes = (totalMinutes) => {
  let safeMinutes = Number(totalMinutes);
  if (!Number.isFinite(safeMinutes)) safeMinutes = 0;
  safeMinutes %= DAY_MINUTES;
  if (safeMinutes < 0) safeMinutes += DAY_MINUTES;

  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${pad2(hours)}:${pad2(minutes)}`;
};

const parseDateStartMs = (dateText) => {
  const safeDate = String(dateText || "").trim();
  if (!isValidDateYYYYMMDD(safeDate)) return NaN;
  return new Date(`${safeDate}T00:00:00`).getTime();
};

const getTodayStartDate = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
};

const getTodayDateKey = () => toLocalDateString(getTodayStartDate().getTime());

const isPastScheduleDate = (dateText, todayStartMs = getTodayStartDate().getTime()) => {
  const scheduleDateMs = parseDateStartMs(dateText);
  if (!Number.isFinite(scheduleDateMs)) return true;
  return scheduleDateMs < todayStartMs;
};

const normalizeStringArray = (value) => {
  if (value === undefined) return undefined;

  let rawItems = value;
  if (typeof rawItems === "string") {
    rawItems = rawItems
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (!Array.isArray(rawItems)) return null;

  const seen = new Set();
  const normalized = [];
  rawItems.forEach((item) => {
    const text = String(item || "").trim();
    if (!text) return;
    const key = normalizeKey(text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    normalized.push(text);
  });

  return normalized;
};

const toBoolean = (value, fallbackValue = false) => {
  if (value === undefined) return fallbackValue;
  if (typeof value === "boolean") return value;

  const normalized = normalizeKey(value);
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;

  return fallbackValue;
};

const toRouteLanePoint = (point) => {
  if (!point || typeof point !== "object") return null;
  const name = normalizeText(point.name);
  if (!name) return null;

  const orderRaw = Number(point.order);
  const order = Number.isFinite(orderRaw) && orderRaw > 0 ? Math.trunc(orderRaw) : undefined;

  return {
    name,
    ...(Number.isFinite(order) ? { order } : {}),
  };
};

const dedupeAndSortLanePoints = (points = []) => {
  const seen = new Set();

  return (Array.isArray(points) ? points : [])
    .map((point) => toRouteLanePoint(point))
    .filter(Boolean)
    .sort((a, b) => {
      const aOrder = Number(a?.order);
      const bOrder = Number(b?.order);
      const safeA = Number.isFinite(aOrder) && aOrder > 0 ? aOrder : Number.MAX_SAFE_INTEGER;
      const safeB = Number.isFinite(bOrder) && bOrder > 0 ? bOrder : Number.MAX_SAFE_INTEGER;
      if (safeA !== safeB) return safeA - safeB;
      return String(a?.name || "").localeCompare(String(b?.name || ""), undefined, { sensitivity: "base" });
    })
    .filter((point) => {
      const key = normalizeKey(point.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const buildSchedulePointsFromRoute = ({ route, date, time, arrivalDate, arrivalTime }) => {
  const routePath = buildRoutePath(route);
  const routeOrderIndex = buildRouteOrderIndex(route);
  const laneData = getRoutePointLanes(route || {});

  const routeSource = normalizeText(route?.source || routePath[0]);
  const routeDestination = normalizeText(route?.destination || routePath[routePath.length - 1] || routeSource);

  const boardingLane = dedupeAndSortLanePoints(
    Array.isArray(laneData?.boardingPoints) && laneData.boardingPoints.length > 0
      ? laneData.boardingPoints
      : routeSource
        ? [{ name: routeSource, order: 1 }]
        : []
  );

  const droppingLane = dedupeAndSortLanePoints(
    Array.isArray(laneData?.droppingPoints) && laneData.droppingPoints.length > 0
      ? laneData.droppingPoints
      : routeDestination
        ? [{ name: routeDestination, order: Math.max(routePath.length, 1) }]
        : []
  );

  if (boardingLane.length === 0 || droppingLane.length === 0) {
    return {
      ok: false,
      message: "Selected route does not contain valid boarding and dropping points",
    };
  }

  const departureMinutes = parseTimeToMinutes(time);
  const arrivalMinutes = parseTimeToMinutes(arrivalTime);
  if (departureMinutes === null || arrivalMinutes === null) {
    return { ok: false, message: "time and arrivalTime must use HH:mm format" };
  }

  const baseDateMs = parseDateStartMs(date);
  if (!Number.isFinite(baseDateMs)) {
    return { ok: false, message: "date must be in YYYY-MM-DD format" };
  }

  const safeArrivalDate = isValidDateYYYYMMDD(arrivalDate) ? String(arrivalDate).trim() : String(date).trim();
  const arrivalStartMs = parseDateStartMs(safeArrivalDate);
  const dayDiff = Number.isFinite(arrivalStartMs)
    ? Math.round((arrivalStartMs - baseDateMs) / DAY_MS)
    : 0;

  let arrivalAbsoluteMinutes = (dayDiff * DAY_MINUTES) + arrivalMinutes;
  while (arrivalAbsoluteMinutes <= departureMinutes) {
    arrivalAbsoluteMinutes += DAY_MINUTES;
  }

  const durationMinutes = arrivalAbsoluteMinutes - departureMinutes;
  const totalSegments = Math.max(routePath.length - 1, 1);

  const buildLaneOutput = (lanePoints) => {
    const laneLength = Math.max(lanePoints.length - 1, 1);

    return lanePoints
      .map((point, idx) => {
        const pointName = normalizeText(point?.name);
        if (!pointName) return null;

        const pointKey = normalizeKey(pointName);
        const routeIndexFromPath = routeOrderIndex.get(pointKey);
        const fallbackIndex = Math.round((idx / laneLength) * totalSegments);
        const safeRouteIndex = Number.isInteger(routeIndexFromPath)
          ? Math.min(totalSegments, Math.max(0, routeIndexFromPath))
          : Math.min(totalSegments, Math.max(0, fallbackIndex));

        const pointAbsoluteMinutes = Math.round(
          departureMinutes + (durationMinutes * (safeRouteIndex / totalSegments))
        );

        const dayOffset = Math.floor(pointAbsoluteMinutes / DAY_MINUTES);
        const minuteOfDay = ((pointAbsoluteMinutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;

        return {
          name: pointName,
          date: toLocalDateString(baseDateMs + (dayOffset * DAY_MS)),
          time: toTimeStringFromMinutes(minuteOfDay),
          order: safeRouteIndex + 1,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  };

  const resolvedArrivalDayOffset = Math.floor(arrivalAbsoluteMinutes / DAY_MINUTES);
  const resolvedArrivalTime = toTimeStringFromMinutes(arrivalAbsoluteMinutes);
  const resolvedArrivalDate = toLocalDateString(baseDateMs + (resolvedArrivalDayOffset * DAY_MS));

  return {
    ok: true,
    boardingPoints: buildLaneOutput(boardingLane),
    droppingPoints: buildLaneOutput(droppingLane),
    durationMinutes,
    arrivalDate: resolvedArrivalDate,
    arrivalTime: resolvedArrivalTime,
  };
};

const buildPointNameKeySet = (points = []) => {
  const out = new Set();
  (Array.isArray(points) ? points : []).forEach((point) => {
    const key = normalizeKey(point?.name);
    if (!key) return;
    out.add(key);
  });
  return out;
};

const laneCoverageMissing = ({ schedulePoints, routeLanePoints }) => {
  const routeKeys = buildPointNameKeySet(routeLanePoints);
  if (routeKeys.size === 0) return false;

  const scheduleKeys = buildPointNameKeySet(schedulePoints);
  for (const key of routeKeys) {
    if (!scheduleKeys.has(key)) return true;
  }

  return false;
};

/**
 * Delegate schedule search to the dedicated search algorithm module.
 */
const { searchService } = require("../../algorithms/search");

const searchSchedules = async ({ query } = {}) => {
  try {
    return await searchService.searchSchedules({ query });
  } catch (e) {
    if (e && e.status && e.message && e.code) {
      throw new ApiError(e.status, e.message, { code: e.code });
    }
    throw e;
  }
};

/**
 * Get available schedules for today and upcoming dates.
 * @returns {Promise<object[]>}
 */
const getAvailableSchedules = async () => {
  const todayDateKey = getTodayDateKey();
  const schedules = await Schedule.find({ isActive: true, date: { $gte: todayDateKey } })
    .populate("bus")
    .populate("route")
    .sort({ date: 1, time: 1 });

  return schedules.map((schedule) => routeSegmentService.normalizeScheduleForOutput(schedule));
};

/**
 * Get district route plan.
 * @param {object} params
 * @param {object} params.query
 * @returns {Promise<object>} 
 */
const getDistrictRoutePlan = async ({ query }) => {
  try {
    const { source, destination } = query || {};
    return await routePlanningService.getRoutePlan({ source, destination, requireBoth: true });
  } catch (e) {
    const { statusCode, payload } = routePlanningService.formatError(e);
    throw new ApiError(statusCode, payload?.message || "Route plan error", payload);
  }
};

/**
 * Get search options for schedules.
 * @returns {Promise<object>} 
 */
const getSearchOptions = async () => {
  const todayDateKey = getTodayDateKey();
  const schedules = await Schedule.find({ isActive: { $ne: false }, date: { $gte: todayDateKey } })
    .populate({ path: "bus", match: { isActive: true }, select: "_id" })
    .populate("route")
    .select("route bus date");
  return routeSegmentService.buildSearchOptions(schedules.filter((schedule) => Boolean(schedule?.bus)));
};

const parseSchedulePrice = (value) => {
  if (value === undefined || value === null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Number(parsed.toFixed(2));
};

const parseObjectId = (value) => {
  if (!mongoose.isValidObjectId(value)) return null;
  return new mongoose.Types.ObjectId(value);
};

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

const resolveScheduleDurationMinutes = (schedule) => {
  const explicitDuration = Number(schedule?.durationMinutes);
  if (Number.isFinite(explicitDuration) && explicitDuration > 0) {
    return Math.trunc(explicitDuration);
  }

  const departureMinutes = parseTimeToMinutes(schedule?.time);
  const arrivalMinutes = parseTimeToMinutes(schedule?.arrivalTime);
  const departureDateStart = parseDateStartMs(schedule?.date);
  const arrivalDateStart = parseDateStartMs(schedule?.arrivalDate || schedule?.date);

  if (
    departureMinutes === null
    || arrivalMinutes === null
    || !Number.isFinite(departureDateStart)
    || !Number.isFinite(arrivalDateStart)
  ) {
    return null;
  }

  const dayDiff = Math.round((arrivalDateStart - departureDateStart) / DAY_MS);
  let arrivalAbsoluteMinutes = (dayDiff * DAY_MINUTES) + arrivalMinutes;
  while (arrivalAbsoluteMinutes <= departureMinutes) {
    arrivalAbsoluteMinutes += DAY_MINUTES;
  }

  const durationMinutes = arrivalAbsoluteMinutes - departureMinutes;
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return null;
  }

  return Math.trunc(durationMinutes);
};

const computeArrivalFromDuration = ({ date, time, durationMinutes }) => {
  const departureMinutes = parseTimeToMinutes(time);
  const baseDateMs = parseDateStartMs(date);
  const safeDuration = Number(durationMinutes);

  if (departureMinutes === null || !Number.isFinite(baseDateMs) || !Number.isFinite(safeDuration) || safeDuration <= 0) {
    return null;
  }

  const absoluteArrivalMinutes = departureMinutes + Math.trunc(safeDuration);
  const dayOffset = Math.floor(absoluteArrivalMinutes / DAY_MINUTES);
  const minuteOfDay = ((absoluteArrivalMinutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;

  return {
    arrivalDate: toLocalDateString(baseDateMs + (dayOffset * DAY_MS)),
    arrivalTime: toTimeStringFromMinutes(minuteOfDay),
  };
};

/**
 * Get operator schedules.
 * @param {object} params
 * @param {string} params.userId
 * @param {object} params.query
 * @returns {Promise<object[]>} 
 */
const getOperatorSchedules = async ({ userId, query }) => {
  const operatorId = parseObjectId(userId);
  if (!operatorId) {
    throw new ApiError(401, "Unauthorized", null);
  }

  const busDocs = await Bus.find({ operator: operatorId, isActive: true }).select("_id").lean();
  const busIds = busDocs.map((bus) => bus._id);
  if (busIds.length === 0) {
    return [];
  }

  const filter = { bus: { $in: busIds } };

  const busFilterId = parseObjectId(query?.bus);
  if (query?.bus !== undefined) {
    if (!busFilterId || !busIds.some((id) => String(id) === String(busFilterId))) {
      return [];
    }
    filter.bus = busFilterId;
  }

  if (query?.date) {
    filter.date = String(query.date);
  }

  if (query?.isActive !== undefined) {
    filter.isActive = toBoolean(query.isActive, true);
  }

  const schedules = await Schedule.find(filter)
    .populate("bus")
    .populate("route")
    .sort({ date: 1, time: 1 });

  return schedules.map((schedule) => routeSegmentService.normalizeScheduleForOutput(schedule));
};

/**
 * Create an operator schedule.
 * @param {object} params
 * @param {string} params.userId
 * @param {object} params.body
 * @returns {Promise<object>} 
 */
const createOperatorSchedule = async ({ userId, body }) => {
  const operatorId = parseObjectId(userId);
  if (!operatorId) {
    throw new ApiError(401, "Unauthorized", null);
  }

  const busId = parseObjectId(body?.bus);
  const routeId = parseObjectId(body?.route);
  const date = normalizeText(body?.date);
  const time = normalizeText(body?.time);
  const arrivalTime = normalizeText(body?.arrivalTime);
  const arrivalDate = normalizeText(body?.arrivalDate || date);
  const price = parseSchedulePrice(body?.price);

  if (!busId || !routeId) {
    throw new ApiError(400, "bus and route are required", null);
  }
  if (!isValidDateYYYYMMDD(date)) {
    throw new ApiError(400, "date must be in YYYY-MM-DD format", null);
  }
  if (!isValidTimeHHmm(time) || !isValidTimeHHmm(arrivalTime)) {
    throw new ApiError(400, "time and arrivalTime must be in HH:mm format", null);
  }
  if (!isValidDateYYYYMMDD(arrivalDate)) {
    throw new ApiError(400, "arrivalDate must be in YYYY-MM-DD format", null);
  }
  if (price === null) {
    throw new ApiError(400, "price must be a non-negative number", null);
  }

  const [bus, route] = await Promise.all([
    Bus.findOne({ _id: busId, operator: operatorId, isActive: true }),
    Route.findById(routeId).lean(),
  ]);

  if (!bus) {
    throw new ApiError(404, "Bus not found for this operator", null);
  }
  if (!route) {
    throw new ApiError(404, "Route not found", null);
  }

  const computedPoints = buildSchedulePointsFromRoute({
    route,
    date,
    time,
    arrivalDate,
    arrivalTime,
  });

  if (!computedPoints.ok) {
    throw new ApiError(400, computedPoints.message, null);
  }

  const features = normalizeStringArray(body?.features);
  if (features === null) {
    throw new ApiError(400, "features must be an array or comma-separated string", null);
  }

  const amenities = normalizeStringArray(body?.amenities);
  if (amenities === null) {
    throw new ApiError(400, "amenities must be an array or comma-separated string", null);
  }

  const schedule = await Schedule.create({
    bus: bus._id,
    route: route._id,
    date,
    time,
    arrivalDate: computedPoints.arrivalDate,
    arrivalTime: computedPoints.arrivalTime,
    durationMinutes: computedPoints.durationMinutes,
    price,
    refundable: toBoolean(body?.refundable, false),
    isActive: toBoolean(body?.isActive, true),
    features: features || [],
    amenities: amenities || [],
    boardingPoints: computedPoints.boardingPoints,
    droppingPoints: computedPoints.droppingPoints,
  });

  const populated = await Schedule.findById(schedule._id)
    .populate("bus")
    .populate("route");

  return routeSegmentService.normalizeScheduleForOutput(populated);
};

/**
 * Update an operator schedule.
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.scheduleId
 * @param {object} params.body
 * @returns {Promise<object>} 
 */
const updateOperatorSchedule = async ({ userId, scheduleId, body }) => {
  const operatorId = parseObjectId(userId);
  if (!operatorId) {
    throw new ApiError(401, "Unauthorized", null);
  }

  const parsedScheduleId = parseObjectId(scheduleId);
  if (!parsedScheduleId) {
    throw new ApiError(400, "Invalid schedule id", null);
  }

  const schedule = await Schedule.findById(parsedScheduleId)
    .populate("bus", "operator")
    .populate("route");
  if (!schedule) {
    throw new ApiError(404, "Schedule not found", null);
  }

  if (String(schedule?.bus?.operator || "") !== String(operatorId)) {
    throw new ApiError(403, "Forbidden", null);
  }

  const blockedFieldMessages = {
    bus: "Operators cannot change schedule bus. Please contact admin.",
    route: "Operators cannot modify route structure.",
    date: "Operators cannot modify schedule date.",
    arrivalDate: "Arrival date is derived automatically and cannot be edited.",
    arrivalTime: "Arrival time is derived automatically and cannot be edited.",
    durationMinutes: "Schedule duration cannot be edited directly.",
    boardingPoints: "Operators cannot modify stops.",
    droppingPoints: "Operators cannot modify stops.",
    features: "Operators cannot modify schedule feature configuration.",
    amenities: "Operators cannot modify schedule amenity configuration.",
    refundable: "Operators cannot modify schedule refund policy.",
  };

  const attemptedBlockedField = Object.keys(blockedFieldMessages).find((field) => hasOwn(body, field));
  if (attemptedBlockedField) {
    throw new ApiError(403, blockedFieldMessages[attemptedBlockedField], null);
  }

  const editableFields = ["time", "price", "isActive"];
  const hasEditableField = editableFields.some((field) => hasOwn(body, field));
  if (!hasEditableField) {
    throw new ApiError(400, "Only time, price, and status can be updated", null);
  }

  const nextTime = hasOwn(body, "time")
    ? normalizeText(body.time)
    : normalizeText(schedule.time);
  if (!isValidTimeHHmm(nextTime)) {
    throw new ApiError(400, "time must be in HH:mm format", null);
  }

  const nextPrice = hasOwn(body, "price")
    ? parseSchedulePrice(body.price)
    : schedule.price;
  if (hasOwn(body, "price") && nextPrice === null) {
    throw new ApiError(400, "price must be a non-negative number", null);
  }

  const scheduleDate = normalizeText(schedule.date);
  if (!isValidDateYYYYMMDD(scheduleDate)) {
    throw new ApiError(400, "Existing schedule date is invalid", null);
  }

  const durationMinutes = resolveScheduleDurationMinutes(schedule);
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    throw new ApiError(400, "Unable to compute schedule duration", null);
  }

  const derivedArrival = computeArrivalFromDuration({
    date: scheduleDate,
    time: nextTime,
    durationMinutes,
  });
  if (!derivedArrival) {
    throw new ApiError(400, "Unable to derive arrival time for updated schedule", null);
  }

  const routeDoc = await Route.findById(schedule.route?._id || schedule.route).lean();
  if (!routeDoc) {
    throw new ApiError(404, "Route not found", null);
  }

  const computedPoints = buildSchedulePointsFromRoute({
    route: routeDoc,
    date: scheduleDate,
    time: nextTime,
    arrivalDate: derivedArrival.arrivalDate,
    arrivalTime: derivedArrival.arrivalTime,
  });

  if (!computedPoints.ok) {
    throw new ApiError(400, computedPoints.message, null);
  }

  schedule.time = nextTime;
  schedule.price = nextPrice;
  schedule.isActive = hasOwn(body, "isActive")
    ? toBoolean(body.isActive, true)
    : Boolean(schedule.isActive !== false);
  schedule.arrivalDate = computedPoints.arrivalDate;
  schedule.arrivalTime = computedPoints.arrivalTime;
  schedule.durationMinutes = computedPoints.durationMinutes;
  schedule.boardingPoints = computedPoints.boardingPoints;
  schedule.droppingPoints = computedPoints.droppingPoints;

  await schedule.save();

  const populated = await Schedule.findById(schedule._id)
    .populate("bus")
    .populate("route");

  return routeSegmentService.normalizeScheduleForOutput(populated);
};

/**
 * Delete an operator schedule.
 * @param {object} params
 * @param {string} params.userId
 * @param {string} params.scheduleId
 * @returns {Promise<object>} 
 */
const deleteOperatorSchedule = async ({ userId, scheduleId }) => {
  const operatorId = parseObjectId(userId);
  if (!operatorId) {
    throw new ApiError(401, "Unauthorized", null);
  }

  const parsedScheduleId = parseObjectId(scheduleId);
  if (!parsedScheduleId) {
    throw new ApiError(400, "Invalid schedule id", null);
  }

  const schedule = await Schedule.findById(parsedScheduleId).populate("bus", "operator");
  if (!schedule) {
    throw new ApiError(404, "Schedule not found", null);
  }

  if (String(schedule?.bus?.operator || "") !== String(operatorId)) {
    throw new ApiError(403, "Forbidden", null);
  }

  const activeBookings = await Booking.countDocuments({
    schedule: parsedScheduleId,
    status: { $in: ["confirmed", "payment_pending"] },
  });
  if (activeBookings > 0) {
    throw new ApiError(409, "Cannot delete schedule with active bookings", null);
  }

  await Schedule.deleteOne({ _id: parsedScheduleId });
  return { message: "Schedule deleted" };
};

/**
 * Get seat status for a schedule.
 * @param {object} params
 * @param {string} params.scheduleId
 * @returns {Promise<object>} 
 */
const getSeatStatus = async ({ scheduleId }) => {
  const schedule = await Schedule.findById(scheduleId).populate("bus").populate("route");
  if (!schedule) {
    throw new ApiError(404, "Schedule not found", null);
  }
  if (schedule?.isActive === false) {
    throw new ApiError(400, "Schedule is no longer active", null);
  }
  if (!schedule?.bus || schedule?.bus?.isActive === false) {
    throw new ApiError(400, "Selected bus is no longer available", null);
  }

  const todayStartMs = getTodayStartDate().getTime();
  if (isPastScheduleDate(schedule?.date, todayStartMs)) {
    throw new ApiError(400, "Cannot access past schedules", null);
  }

  const routeDoc = schedule?.route?.toObject ? schedule.route.toObject() : schedule?.route;
  const routeLanePoints = getRoutePointLanes(routeDoc || {});
  const scheduleNeedsLaneRepair = laneCoverageMissing({
    schedulePoints: schedule?.boardingPoints,
    routeLanePoints: routeLanePoints?.boardingPoints,
  }) || laneCoverageMissing({
    schedulePoints: schedule?.droppingPoints,
    routeLanePoints: routeLanePoints?.droppingPoints,
  });

  if (scheduleNeedsLaneRepair && routeDoc) {
    const computedPoints = buildSchedulePointsFromRoute({
      route: routeDoc,
      date: normalizeText(schedule?.date),
      time: normalizeText(schedule?.time),
      arrivalDate: normalizeText(schedule?.arrivalDate || schedule?.date),
      arrivalTime: normalizeText(schedule?.arrivalTime),
    });

    if (computedPoints.ok) {
      schedule.boardingPoints = computedPoints.boardingPoints;
      schedule.droppingPoints = computedPoints.droppingPoints;
      schedule.arrivalDate = computedPoints.arrivalDate;
      schedule.arrivalTime = computedPoints.arrivalTime;
      schedule.durationMinutes = computedPoints.durationMinutes;
      await schedule.save();
    }
  }

  const fallbackSeatPrice = toFinitePrice(schedule?.price, DEFAULT_SEAT_PRICE);
  const { seatLayout, seatCatalog, totalSeats } = buildSeatLayoutFromBus(schedule.bus, fallbackSeatPrice);
  const confirmedBookings = await Booking.find({ schedule: scheduleId, status: "confirmed" }).select("seats");
  const bookedSeats = [...new Set(
    confirmedBookings
      .flatMap((b) => (Array.isArray(b?.seats) ? b.seats : []))
      .map((seat) => normalizeSeatLabel(seat))
      .filter((seat) => seatCatalog.has(seat))
  )].sort(sortSeatLabels);

  const lockDurationMs = seatLockService.getLockDurationMs();
  const locks = await seatLockService.getActiveLocks(scheduleId);
  const lockedSeats = locks
    .map((l) => ({
      seatLabel: normalizeSeatLabel(l.seatNumber || l.seatLabel),
      seatNumber: normalizeSeatLabel(l.seatNumber || l.seatLabel),
      userId: l.userId,
      lockedBy: l.userId,
      lockedAt: l.lockedAt || (l.expiresAt ? new Date(new Date(l.expiresAt).getTime() - lockDurationMs) : null),
      expiresAt: l.expiresAt,
      status: l.status || "LOCKED",
    }))
    .filter((l) => seatCatalog.has(l.seatLabel))
    .sort((a, b) => sortSeatLabels(a.seatLabel, b.seatLabel));

  const seatPriceMap = {};
  seatCatalog.forEach((seat, seatLabel) => {
    seatPriceMap[seatLabel] = seat.price;
  });

  return {
    schedule: routeSegmentService.normalizeScheduleForOutput(schedule),
    totalSeats,
    bookedSeats,
    lockedSeats,
    lockDurationMs,
    seatLayout,
    seatPriceMap,
  };
};

module.exports = {
  searchSchedules,
  getAvailableSchedules,
  getDistrictRoutePlan,
  getSearchOptions,
  getOperatorSchedules,
  createOperatorSchedule,
  updateOperatorSchedule,
  deleteOperatorSchedule,
  getSeatStatus,
};
