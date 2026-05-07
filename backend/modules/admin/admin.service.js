// Handles admin-level operations: managing users, buses, routes, and schedules
const mongoose = require("mongoose");
const {
  Bus,
  City,
  Route,
  Schedule,
  Stop,
  User,
  Booking,
  Notification,
} = require("./admin.model");
const cloudinary = require("../../config/cloudinary");
const { createAdminNotification } = require("../../services/notification.service");
const {
  normalizeKey,
  normalizeText,
  toStopName,
  isValidTimeHHmm,
  normalizeRoutePointList,
  getRoutePointLanes,
} = require("../../utils/routePoints");

const stopKey = (s) => normalizeKey(s);
const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const rangeDaysByKey = {
  "7d": 7,
  "30d": 30,
  "3m": 90,
  "1y": 365,
};
const bookingAnalyticsStatusMatch = { status: "confirmed" };
const userRoleSet = new Set(["admin", "operator", "customer"]);

const toSafeText = (value) => String(value ?? "").trim();
const busPolicyFields = ["refundPolicy", "cancellationPolicy", "dateChangePolicy", "luggagePolicy"];
const BUS_CATEGORIES = ["AC_SLEEPER", "AC_SEATER", "NON_AC_SEATER"];
const BUS_CATEGORY_SET = new Set(BUS_CATEGORIES);
const BUS_TYPES = ["SLEEPER", "SINGLE_SLEEPER", "DOUBLE_SLEEPER", "CABIN_SLEEPER", "SINGLE_SEATER", "AC", "SOFA_SEATER"];
const BUS_TYPE_SET = new Set(BUS_TYPES);
const SLEEPER_BUS_TYPE_SET = new Set(["SLEEPER", "SINGLE_SLEEPER", "DOUBLE_SLEEPER", "CABIN_SLEEPER"]);
const SEAT_TYPES = ["SEATER", "SLEEPER", "SHARED_SLEEPER"];
const SEAT_TYPE_SET = new Set(SEAT_TYPES);
const busCategoryToLegacyType = {
  AC_SLEEPER: "Sleeper",
  AC_SEATER: "AC",
  NON_AC_SEATER: "Non-AC",
};
const categoryToDefaultBusTypes = {
  AC_SLEEPER: ["AC", "SLEEPER"],
  AC_SEATER: ["AC", "SINGLE_SEATER"],
  NON_AC_SEATER: ["SINGLE_SEATER"],
};
const legacyTypeToBusCategory = {
  sleeper: "AC_SLEEPER",
  ac: "AC_SEATER",
  "non-ac": "NON_AC_SEATER",
  nonac: "NON_AC_SEATER",
};
const DEPRECATED_SCHEDULE_PRICE_FIELDS = ["price", "priceMin", "priceMax"];
const BUS_IMAGE_TYPES = ["bus", "seatLayout", "sleeperLayout"];
const CLOUDINARY_HOST_RE = /(^|\.)cloudinary\.com$/i;

const normalizeSeatLabel = (value) => String(value || "").trim().toUpperCase().replace(/\s+/g, "");
const normalizeBusTypeValue = (value) => String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
const hasOwnProp = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
const normalizeImagePath = (value) => String(value || "").trim();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const looksLikeEmail = (value) => EMAIL_RE.test(String(value || "").trim());
const normalizeEmail = (value) => String(value || "").trim().toLowerCase();

const parseOperatorAssignmentInput = (body = {}) => {
  const hasOperatorEmail = hasOwnProp(body, "operatorEmail");
  const hasOperator = hasOwnProp(body, "operator");
  if (!hasOperatorEmail && !hasOperator) return { hasInput: false };

  const emailInput = toSafeText(body.operatorEmail);
  const operatorInput = toSafeText(body.operator);
  const token = emailInput || operatorInput;

  if (!token) {
    return {
      hasInput: true,
      clear: true,
      token: "",
    };
  }

  return {
    hasInput: true,
    clear: false,
    token,
  };
};

const resolveOperatorAssignment = async (body = {}) => {
  const parsed = parseOperatorAssignmentInput(body);
  if (!parsed.hasInput) {
    return {
      hasInput: false,
      clear: false,
      operatorId: undefined,
    };
  }

  if (parsed.clear) {
    return {
      hasInput: true,
      clear: true,
      operatorId: undefined,
    };
  }

  const token = toSafeText(parsed.token);
  const byEmail = looksLikeEmail(token);
  const byObjectId = mongoose.isValidObjectId(token);

  if (!byEmail && !byObjectId) {
    return {
      hasInput: true,
      error: "Operator must be provided as a valid operator email address.",
    };
  }

  const query = byEmail
    ? { email: normalizeEmail(token), role: "operator", isActive: true }
    : { _id: token, role: "operator", isActive: true };

  const operatorUser = await User.findOne(query).select("_id email").lean();
  if (!operatorUser) {
    return {
      hasInput: true,
      error: byEmail
        ? `No active operator account found for email "${token}"`
        : "Operator id is invalid or does not belong to an active operator",
    };
  }

  return {
    hasInput: true,
    clear: false,
    operatorId: operatorUser._id,
  };
};

const normalizeBusImageType = (value) => {
  const token = String(value || "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  if (!token) return "";
  if (["bus", "main", "image", "exterior"].includes(token)) return "bus";
  if (["seat", "seat-layout", "seatlayout", "layout"].includes(token)) return "seatLayout";
  if (["sleeper", "sleeper-layout", "sleeperlayout"].includes(token)) return "sleeperLayout";
  return "";
};

const toBusImagesObject = (rawImages) => {
  const source = rawImages && typeof rawImages === "object" && !Array.isArray(rawImages) ? rawImages : {};
  return {
    bus: normalizeImagePath(source.bus),
    seatLayout: normalizeImagePath(source.seatLayout),
    sleeperLayout: normalizeImagePath(source.sleeperLayout),
  };
};

const parseBooleanFlag = (value) => {
  if (typeof value === "boolean") return value;
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes" || normalized === "on";
};

const parseBusImageRemoveFlags = (body = {}) => ({
  bus: parseBooleanFlag(body.removeBusImage),
  seatLayout: parseBooleanFlag(body.removeSeatLayoutImage),
  sleeperLayout: parseBooleanFlag(body.removeSleeperLayoutImage),
});

const parseBusImagesPatchFromBody = (body = {}) => {
  const patch = {};

  let nestedImages = body.images;
  if (typeof nestedImages === "string") {
    const trimmed = nestedImages.trim();
    if (!trimmed) nestedImages = null;
    else {
      try {
        nestedImages = JSON.parse(trimmed);
      } catch {
        nestedImages = null;
      }
    }
  }

  if (nestedImages && typeof nestedImages === "object" && !Array.isArray(nestedImages)) {
    if (hasOwnProp(nestedImages, "bus")) patch.bus = normalizeImagePath(nestedImages.bus);
    if (hasOwnProp(nestedImages, "seatLayout")) patch.seatLayout = normalizeImagePath(nestedImages.seatLayout);
    if (hasOwnProp(nestedImages, "sleeperLayout")) patch.sleeperLayout = normalizeImagePath(nestedImages.sleeperLayout);
  }

  if (Array.isArray(nestedImages)) {
    nestedImages.forEach((entry) => {
      const type = normalizeBusImageType(entry?.type);
      if (!type) return;
      patch[type] = normalizeImagePath(entry?.url);
    });
  }

  if (hasOwnProp(body, "imageUrl")) patch.bus = normalizeImagePath(body.imageUrl);
  if (hasOwnProp(body, "busImageUrl")) patch.bus = normalizeImagePath(body.busImageUrl);
  if (hasOwnProp(body, "seatLayoutImageUrl")) patch.seatLayout = normalizeImagePath(body.seatLayoutImageUrl);
  if (hasOwnProp(body, "sleeperLayoutImageUrl")) patch.sleeperLayout = normalizeImagePath(body.sleeperLayoutImageUrl);

  return patch;
};

const firstUploadedFile = (files, fieldName) => {
  const items = files && files[fieldName];
  if (!Array.isArray(items) || items.length === 0) return null;
  return items[0] || null;
};

const toBusImagePublicPath = (file) => {
  const uploadedPath = normalizeImagePath(file?.path || file?.secure_url || file?.url);
  return uploadedPath;
};

const extractUploadedBusImagePaths = (files = {}) => ({
  bus: toBusImagePublicPath(firstUploadedFile(files, "busImage") || firstUploadedFile(files, "image")),
  seatLayout: toBusImagePublicPath(firstUploadedFile(files, "seatLayoutImage")),
  sleeperLayout: toBusImagePublicPath(firstUploadedFile(files, "sleeperLayoutImage")),
});

const mergeBusImages = ({ baseImages, body = {}, uploadedImages = {}, removeFlags = {} }) => {
  const next = toBusImagesObject(baseImages);
  const bodyPatch = parseBusImagesPatchFromBody(body);

  BUS_IMAGE_TYPES.forEach((type) => {
    if (hasOwnProp(bodyPatch, type)) {
      next[type] = normalizeImagePath(bodyPatch[type]);
    }
  });

  BUS_IMAGE_TYPES.forEach((type) => {
    if (removeFlags[type]) {
      next[type] = "";
    }
  });

  BUS_IMAGE_TYPES.forEach((type) => {
    const uploadedPath = normalizeImagePath(uploadedImages[type]);
    if (uploadedPath) {
      next[type] = uploadedPath;
    }
  });

  return toBusImagesObject(next);
};

const withBusImageCompatibility = (busDoc) => {
  if (!busDoc) return busDoc;
  const bus = busDoc?.toObject ? busDoc.toObject() : { ...busDoc };
  const images = toBusImagesObject(bus?.images);

  if (!images.bus) {
    images.bus = normalizeImagePath(bus?.imageUrl);
  }

  bus.images = images;
  bus.imageUrl = images.bus || undefined;
  return bus;
};

const toCloudinaryPublicId = (imageUrl) => {
  const safeUrl = normalizeImagePath(imageUrl);
  if (!safeUrl) return "";

  let parsed;
  try {
    parsed = new URL(safeUrl);
  } catch {
    return "";
  }

  if (!CLOUDINARY_HOST_RE.test(parsed.hostname || "")) return "";

  const uploadMarker = "/upload/";
  const markerIndex = parsed.pathname.indexOf(uploadMarker);
  if (markerIndex < 0) return "";

  const rawAssetPath = parsed.pathname.slice(markerIndex + uploadMarker.length);
  const rawSegments = rawAssetPath.split("/").filter(Boolean);
  if (rawSegments.length === 0) return "";

  const versionIndex = rawSegments.findIndex((segment) => /^v\d+$/.test(segment));
  const publicIdSegments = versionIndex >= 0
    ? rawSegments.slice(versionIndex + 1)
    : rawSegments;

  if (publicIdSegments.length === 0) return "";

  const decodedSegments = publicIdSegments.map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });

  const lastIndex = decodedSegments.length - 1;
  decodedSegments[lastIndex] = decodedSegments[lastIndex].replace(/\.[^./]+$/, "");
  if (!decodedSegments[lastIndex]) return "";

  return normalizeImagePath(decodedSegments.join("/"));
};

const safeDeleteBusImageByPath = async (publicPath) => {
  const publicId = toCloudinaryPublicId(publicPath);
  if (!publicId) return;

  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
  } catch {
    // ignore cleanup failures
  }
};

const cleanupReplacedBusImages = async ({ previousImages, nextImages }) => {
  const previous = toBusImagesObject(previousImages);
  const next = toBusImagesObject(nextImages);

  const deletions = BUS_IMAGE_TYPES
    .filter((type) => previous[type] && previous[type] !== next[type])
    .map((type) => safeDeleteBusImageByPath(previous[type]));

  await Promise.all(deletions);
};

const normalizeSeatType = (value) => {
  const normalized = String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized === "SLEEPER") return "SLEEPER";
  if (normalized === "SHARED_SLEEPER") return "SHARED_SLEEPER";
  if (normalized === "SEATER") return "SEATER";
  return null;
};

const normalizeBusTypes = (values) => {
  const seen = new Set();
  const normalized = [];

  (Array.isArray(values) ? values : []).forEach((value) => {
    const token = normalizeBusTypeValue(value);
    if (!token || seen.has(token)) return;
    seen.add(token);
    normalized.push(token);
  });

  return normalized;
};

const normalizeBusCategory = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (BUS_CATEGORY_SET.has(upper)) return upper;

  const legacyKey = raw.toLowerCase().replace(/\s+/g, "-");
  return legacyTypeToBusCategory[legacyKey] || null;
};

const deriveBusCategoryFromBusTypes = (busTypes) => {
  const normalizedTypes = normalizeBusTypes(busTypes);
  if (normalizedTypes.some((type) => SLEEPER_BUS_TYPE_SET.has(type))) return "AC_SLEEPER";
  if (normalizedTypes.includes("AC")) return "AC_SEATER";
  return "NON_AC_SEATER";
};

const parseBusTypesInput = (rawBusTypes, fallbackCategoryOrType) => {
  if (rawBusTypes === undefined) {
    const fallbackCategory = normalizeBusCategory(fallbackCategoryOrType);
    if (!fallbackCategory) {
      return { hasInput: false, ok: true, value: undefined };
    }
    return { hasInput: false, ok: true, value: [...(categoryToDefaultBusTypes[fallbackCategory] || ["SINGLE_SEATER"]) ] };
  }

  let parsed = rawBusTypes;
  if (typeof parsed === "string") {
    const trimmed = parsed.trim();
    if (!trimmed) {
      return { hasInput: true, ok: false, message: "At least one bus type is required" };
    }

    try {
      const jsonValue = JSON.parse(trimmed);
      parsed = Array.isArray(jsonValue) ? jsonValue : [jsonValue];
    } catch {
      parsed = trimmed.split(",");
    }
  }

  if (!Array.isArray(parsed)) {
    return { hasInput: true, ok: false, message: "busTypes must be an array" };
  }

  const normalizedTokens = parsed.map((value) => normalizeBusTypeValue(value)).filter(Boolean);
  if (normalizedTokens.length === 0) {
    return { hasInput: true, ok: false, message: "At least one bus type is required" };
  }

  const seen = new Set();
  const duplicates = new Set();
  normalizedTokens.forEach((token) => {
    if (seen.has(token)) duplicates.add(token);
    seen.add(token);
  });
  if (duplicates.size > 0) {
    return { hasInput: true, ok: false, message: "Duplicate bus types are not allowed" };
  }

  const invalidType = normalizedTokens.find((token) => !BUS_TYPE_SET.has(token));
  if (invalidType) {
    return { hasInput: true, ok: false, message: `Invalid bus type: ${invalidType}` };
  }

  return {
    hasInput: true,
    ok: true,
    value: normalizedTokens,
  };
};

const parseDecksInput = (rawDecks) => {
  if (rawDecks === undefined) return { hasInput: false, value: undefined, totalSeats: undefined };

  let parsed = rawDecks;
  if (typeof parsed === "string") {
    const trimmed = parsed.trim();
    if (!trimmed) return { hasInput: true, ok: false, message: "decks must be a non-empty JSON array" };
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return { hasInput: true, ok: false, message: "decks must be valid JSON" };
    }
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { hasInput: true, ok: false, message: "At least one deck is required" };
  }

  const normalizedDecks = [];
  const seenSeatLabels = new Set();
  let totalSeats = 0;

  for (let deckIndex = 0; deckIndex < parsed.length; deckIndex += 1) {
    const rawDeck = parsed[deckIndex];
    if (!rawDeck || typeof rawDeck !== "object") {
      return { hasInput: true, ok: false, message: `Deck ${deckIndex + 1} is invalid` };
    }

    const deckNumberRaw = Number(rawDeck.deckNumber);
    const deckNumber = Number.isFinite(deckNumberRaw) && deckNumberRaw > 0
      ? Math.trunc(deckNumberRaw)
      : deckIndex + 1;
    const deckName = toSafeText(rawDeck.name) || (deckNumber === 1 ? "Lower Deck" : `Deck ${deckNumber}`);
    const rawSeats = Array.isArray(rawDeck.seats) ? rawDeck.seats : [];

    if (rawSeats.length === 0) {
      return { hasInput: true, ok: false, message: `Deck ${deckNumber} must have at least one seat` };
    }

    const seats = [];

    for (let seatIndex = 0; seatIndex < rawSeats.length; seatIndex += 1) {
      const rawSeat = rawSeats[seatIndex];
      if (!rawSeat || typeof rawSeat !== "object") {
        return { hasInput: true, ok: false, message: `Invalid seat at deck ${deckNumber}, row ${seatIndex + 1}` };
      }

      const seatLabel = normalizeSeatLabel(rawSeat.seatNumber);
      if (!seatLabel) {
        return { hasInput: true, ok: false, message: `Seat label is required at deck ${deckNumber}, row ${seatIndex + 1}` };
      }
      if (seenSeatLabels.has(seatLabel)) {
        return { hasInput: true, ok: false, message: `Duplicate seat label detected: ${seatLabel}` };
      }
      seenSeatLabels.add(seatLabel);

      const seatType = normalizeSeatType(rawSeat.seatType);
      if (!seatType || !SEAT_TYPE_SET.has(seatType)) {
        return { hasInput: true, ok: false, message: `Seat type must be one of ${SEAT_TYPES.join(", ")} (seat ${seatLabel})` };
      }

      const price = Number(rawSeat.price);
      if (!Number.isFinite(price) || price < 0) {
        return { hasInput: true, ok: false, message: `Seat price must be a non-negative number (seat ${seatLabel})` };
      }

      const rowRaw = Number(rawSeat.row);
      const columnRaw = Number(rawSeat.column);
      const seat = {
        seatNumber: seatLabel,
        seatType,
        price,
        isAvailable: rawSeat.isAvailable !== false,
      };

      if (Number.isFinite(rowRaw) && rowRaw > 0) {
        seat.row = Math.trunc(rowRaw);
      }
      if (Number.isFinite(columnRaw) && columnRaw > 0) {
        seat.column = Math.trunc(columnRaw);
      }

      seats.push(seat);
      totalSeats += 1;
    }

    normalizedDecks.push({
      deckNumber,
      name: deckName,
      seats,
    });
  }

  if (totalSeats <= 0) {
    return { hasInput: true, ok: false, message: "At least one seat is required" };
  }

  return {
    hasInput: true,
    ok: true,
    value: normalizedDecks,
    totalSeats,
  };
};

const getProvidedDeprecatedSchedulePriceFields = (payload) => DEPRECATED_SCHEDULE_PRICE_FIELDS.filter(
  (field) => Object.prototype.hasOwnProperty.call(payload || {}, field)
    && payload[field] !== undefined
    && payload[field] !== null
    && payload[field] !== ""
);

const extractBusPolicies = (body = {}) => {
  const nestedPolicies = body && typeof body.policies === "object" && !Array.isArray(body.policies) ? body.policies : {};
  const policies = {};
  let hasInput = false;

  busPolicyFields.forEach((field) => {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      policies[field] = toSafeText(body[field]);
      hasInput = true;
      return;
    }

    if (Object.prototype.hasOwnProperty.call(nestedPolicies, field)) {
      policies[field] = toSafeText(nestedPolicies[field]);
      hasInput = true;
    }
  });

  return { hasInput, policies };
};

const parsePositiveInt = (value, { defaultValue, min = 1, max = 100 }) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return defaultValue;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
};

const parseRangeWindow = (rangeValue) => {
  const normalizedRange = Object.prototype.hasOwnProperty.call(rangeDaysByKey, rangeValue) ? rangeValue : "30d";
  const days = rangeDaysByKey[normalizedRange];

  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setHours(0, 0, 0, 0);
  startDate.setDate(startDate.getDate() - (days - 1));

  return { normalizedRange, startDate, endDate };
};

const getTodayDateKey = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const buildCreatedAtMatch = ({ startDate, endDate }) => ({
  createdAt: {
    $gte: startDate,
    $lte: endDate,
  },
});

const supportsCreatedAtFilter = (Model) => Boolean(Model?.schema?.path("createdAt"));

const countModelWithRange = async (Model, rangeWindow) => {
  if (!supportsCreatedAtFilter(Model)) {
    return Model.countDocuments({});
  }
  return Model.countDocuments(buildCreatedAtMatch(rangeWindow));
};

const toMonthToken = (year, monthNumber) => `${year}-${String(monthNumber).padStart(2, "0")}`;

const buildMonthSeries = (rangeWindow, valueByMonthToken, valueKey) => {
  const start = new Date(rangeWindow.startDate);
  const end = new Date(rangeWindow.endDate);
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);
  const monthDates = [];

  while (cursor <= endMonth) {
    monthDates.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  const includeYear = monthDates.length > 12;

  return monthDates.map((monthDate) => {
    const monthNumber = monthDate.getMonth() + 1;
    const token = toMonthToken(monthDate.getFullYear(), monthNumber);
    const monthLabel = includeYear
      ? `${monthLabels[monthDate.getMonth()]} ${String(monthDate.getFullYear()).slice(-2)}`
      : monthLabels[monthDate.getMonth()];

    return {
      month: monthLabel,
      [valueKey]: Number(valueByMonthToken.get(token) || 0),
    };
  });
};

const toStopKmFromSource = (raw) => {
  if (!raw || typeof raw !== "object") return undefined;
  if (raw.kmFromSource !== undefined) return raw.kmFromSource;
  // tolerate alternative keys from clients
  if (raw.distanceFromSourceKm !== undefined) return raw.distanceFromSourceKm;
  if (raw.km !== undefined) return raw.km;
  return undefined;
};

const normalizeLegacyRouteStops = ({ stops, source, destination, distance }) => {
  if (stops === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(stops)) return { ok: false, message: "stops must be an array" };

  const srcKey = stopKey(source);
  const dstKey = stopKey(destination);
  const totalKm = Number(distance);
  const hasTotalKm = Number.isFinite(totalKm) && totalKm > 0;

  const seenNames = new Set();
  const rawRows = [];
  let nextOrder = 1;

  for (const raw of stops) {
    const name = String(toStopName(raw) || "").trim();
    if (!name) continue;
    const k = stopKey(name);
    if (!k) continue;
    if (k === srcKey || k === dstKey) continue;
    if (seenNames.has(k)) continue;
    seenNames.add(k);

    const providedOrder = raw && typeof raw === "object" ? raw.order ?? raw.orderIndex : undefined;
    let order = Number(providedOrder);
    if (!Number.isFinite(order)) {
      order = nextOrder;
    }

    order = Math.trunc(order);
    if (!Number.isFinite(order) || order <= 0) {
      return { ok: false, message: `Invalid order for stop: ${name}` };
    }
    nextOrder = Math.max(nextOrder + 1, order + 1);

    let km = toStopKmFromSource(raw);
    if (km !== undefined && km !== null && km !== "") {
      km = Number(km);
      if (!Number.isFinite(km)) return { ok: false, message: `Invalid kmFromSource for stop: ${name}` };
      if (km <= 0) return { ok: false, message: `kmFromSource must be > 0 for stop: ${name}` };
      if (hasTotalKm && km >= totalKm) return { ok: false, message: `kmFromSource must be < route distance for stop: ${name}` };
    } else {
      km = undefined;
    }

    rawRows.push({ name, order, kmFromSource: km });
  }

  const seenOrders = new Set();
  for (const row of rawRows) {
    if (seenOrders.has(row.order)) {
      return { ok: false, message: `Duplicate order value: ${row.order}` };
    }
    seenOrders.add(row.order);
  }

  rawRows.sort((a, b) => a.order - b.order);

  let lastDefinedKm = null;
  for (const row of rawRows) {
    const km = row.kmFromSource;
    if (km === undefined) continue;
    if (lastDefinedKm !== null && km <= lastDefinedKm) {
      return { ok: false, message: "Stop kmFromSource values must be increasing in route order" };
    }
    lastDefinedKm = km;
  }

  const out = rawRows.map((row) => {
    const stop = { name: row.name, order: row.order };
    if (row.kmFromSource !== undefined) stop.kmFromSource = row.kmFromSource;
    return stop;
  });

  return { ok: true, value: out };
};

const normalizeSchedulePointList = (points) => {
  if (points === undefined) return undefined;
  if (!Array.isArray(points)) return null;

  const seen = new Set();
  const out = [];
  let nextOrder = 1;

  for (const p of points) {
    if (!p || typeof p !== "object") return null;
    const name = normalizeText(p.name || "");
    const date = normalizeText(p.date || "");
    const time = normalizeText(p.time || "");
    const providedOrder = p.order ?? p.orderIndex;
    const parsedOrder = Number(providedOrder);
    const order = Number.isFinite(parsedOrder) && parsedOrder > 0 ? Math.trunc(parsedOrder) : nextOrder;

    if (!name || !date || !time) return null;
    if (!isValidTimeHHmm(time)) return null;

    nextOrder = Math.max(nextOrder + 1, order + 1);
    const k = stopKey(name);
    if (!k) return null;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ name, date, time, order });
  }
  return out;
};

const toIsoDateTimeMs = (date, time) => {
  const d = String(date || "").trim();
  const t = String(time || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(t)) return NaN;
  return new Date(`${d}T${t}:00`).getTime();
};

const buildPointLaneIndexByKey = (points) => {
  const sorted = [...(Array.isArray(points) ? points : [])].sort((a, b) => {
    const aOrder = Number(a?.order);
    const bOrder = Number(b?.order);
    const safeAOrder = Number.isFinite(aOrder) && aOrder > 0 ? aOrder : Number.MAX_SAFE_INTEGER;
    const safeBOrder = Number.isFinite(bOrder) && bOrder > 0 ? bOrder : Number.MAX_SAFE_INTEGER;
    if (safeAOrder !== safeBOrder) return safeAOrder - safeBOrder;
    return String(a?.name || "").localeCompare(String(b?.name || ""), undefined, { sensitivity: "base" });
  });

  const map = new Map();
  sorted.forEach((point, idx) => {
    const k = stopKey(point?.name);
    if (!k) return;
    if (!map.has(k)) map.set(k, idx);
  });

  return map;
};

const validatePointOrderAndTime = (points, pointIndexByKey) => {
  const enriched = points.map((p) => {
    const explicitOrder = Number(p?.order);
    const mappedOrder = pointIndexByKey.get(stopKey(p?.name));
    return {
      ...p,
      idx:
        Number.isFinite(mappedOrder)
          ? mappedOrder
          : Number.isFinite(explicitOrder) && explicitOrder > 0
            ? explicitOrder - 1
            : undefined,
    };
  });

  const unknown = enriched.find((p) => p.idx === undefined);
  if (unknown) return { ok: false, message: `Point not found in route stops: ${unknown.name}` };
  enriched.sort((a, b) => a.idx - b.idx);
  let prev = null;
  for (const p of enriched) {
    const ms = toIsoDateTimeMs(p.date, p.time);
    if (!Number.isFinite(ms)) return { ok: false, message: `Invalid date/time for: ${p.name}` };
    if (prev !== null && ms < prev) return { ok: false, message: `Times must follow route order (check: ${p.name})` };
    prev = ms;
  }
  return {
    ok: true,
    points: enriched.map((p) => ({
      name: p.name,
      date: p.date,
      time: p.time,
      order: p.idx + 1,
    })),
  };
};

const withRoutePointCompatibility = (routeDoc) => {
  if (!routeDoc) return routeDoc;
  const route = routeDoc?.toObject ? routeDoc.toObject() : { ...routeDoc };
  const { boardingPoints, droppingPoints } = getRoutePointLanes(route);
  route.boardingPoints = boardingPoints;
  route.droppingPoints = droppingPoints;
  return route;
};

const normalizeSchedulePointsForOutput = ({ points, fallbackLanePoints, fallbackDate }) => {
  const lane = Array.isArray(fallbackLanePoints) ? fallbackLanePoints : [];
  const laneOrderByKey = new Map();
  lane.forEach((point, idx) => {
    const key = stopKey(point?.name);
    if (!key || laneOrderByKey.has(key)) return;
    const explicitOrder = Number(point?.order);
    const order = Number.isFinite(explicitOrder) && explicitOrder > 0 ? Math.trunc(explicitOrder) : idx + 1;
    laneOrderByKey.set(key, order);
  });

  const inputPoints = Array.isArray(points) && points.length > 0
    ? points
    : lane.map((point) => ({
      name: point?.name,
      time: point?.time,
      date: fallbackDate,
      order: point?.order,
    }));

  const seen = new Set();
  const out = [];

  inputPoints.forEach((point, idx) => {
    const name = normalizeText(point?.name);
    if (!name) return;

    const key = stopKey(name);
    if (!key || seen.has(key)) return;
    seen.add(key);

    const time = normalizeText(point?.time);
    const date = normalizeText(point?.date || fallbackDate);
    const explicitOrder = Number(point?.order);
    const laneOrder = laneOrderByKey.get(key);
    const order = Number.isFinite(explicitOrder) && explicitOrder > 0
      ? Math.trunc(explicitOrder)
      : Number.isFinite(laneOrder) && laneOrder > 0
        ? laneOrder
        : idx + 1;

    out.push({ name, time, date, order });
  });

  return out.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
};

const withSchedulePointCompatibility = (scheduleDoc) => {
  if (!scheduleDoc) return scheduleDoc;

  const schedule = scheduleDoc?.toObject ? scheduleDoc.toObject() : { ...scheduleDoc };
  const route = withRoutePointCompatibility(schedule?.route);
  schedule.route = route;

  const scheduleDate = normalizeText(schedule?.date);
  schedule.boardingPoints = normalizeSchedulePointsForOutput({
    points: schedule?.boardingPoints,
    fallbackLanePoints: route?.boardingPoints,
    fallbackDate: scheduleDate,
  });
  schedule.droppingPoints = normalizeSchedulePointsForOutput({
    points: schedule?.droppingPoints,
    fallbackLanePoints: route?.droppingPoints,
    fallbackDate: scheduleDate,
  });

  return schedule;
};

// BUS
exports.createBus = async (req, res) => {
  try {
    const { name, type, vehicleNumber } = req.body || {};
    const busPhone = toSafeText(req.body?.phone || req.body?.busPhone || req.body?.contactNumber);
    const operatorResolution = await resolveOperatorAssignment(req.body || {});
    if (operatorResolution.error) {
      return res.status(400).json({ message: operatorResolution.error });
    }

    const busTypeParse = parseBusTypesInput(req.body?.busTypes, req.body?.busCategory || type);
    if (busTypeParse.ok === false) {
      return res.status(400).json({ message: busTypeParse.message || "Invalid busTypes payload" });
    }

    const busTypes = Array.isArray(busTypeParse.value) ? busTypeParse.value : [];
    if (busTypes.length === 0) {
      return res.status(400).json({ message: "At least one bus type is required" });
    }
    const busCategory = deriveBusCategoryFromBusTypes(busTypes);

    const deckParse = parseDecksInput(req.body?.decks);
    if (deckParse.hasInput && deckParse.ok === false) {
      return res.status(400).json({ message: deckParse.message || "Invalid decks payload" });
    }

    const totalSeatsRaw = req.body?.totalSeats;
    let totalSeats = totalSeatsRaw !== undefined && totalSeatsRaw !== null && totalSeatsRaw !== "" ? Number(totalSeatsRaw) : undefined;

    if (deckParse.hasInput && deckParse.ok) {
      totalSeats = deckParse.totalSeats;
    }

    if (totalSeats !== undefined && (!Number.isFinite(totalSeats) || totalSeats < 1)) {
      return res.status(400).json({ message: "totalSeats must be a positive number" });
    }
    if (!Number.isFinite(totalSeats) || totalSeats < 1) {
      return res.status(400).json({ message: "At least one seat must be configured via decks" });
    }

    const uploadedImages = extractUploadedBusImagePaths(req.files || {});
    const images = mergeBusImages({
      baseImages: { bus: req.body?.imageUrl },
      body: req.body || {},
      uploadedImages,
      removeFlags: {},
    });

    const { hasInput: hasPolicyInput, policies } = extractBusPolicies(req.body || {});

    const bus = await Bus.create({
      name,
      type: busCategoryToLegacyType[busCategory] || "AC",
      busCategory,
      busTypes,
      vehicleNumber: toSafeText(vehicleNumber) || undefined,
      phone: busPhone || undefined,
      totalSeats,
      decks: deckParse.hasInput && deckParse.ok ? deckParse.value : undefined,
      operator: operatorResolution.operatorId,
      images,
      imageUrl: images.bus || undefined,
      policies: hasPolicyInput ? policies : undefined,
    });
    res.status(201).json(withBusImageCompatibility(bus));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getBuses = async (req, res) => {
  const buses = await Bus.find({ isActive: true }).populate("operator");
  res.json(buses.map((bus) => withBusImageCompatibility(bus)));
};

exports.updateBus = async (req, res) => {
  try {
    const updates = { ...req.body };
    const uploadedImages = extractUploadedBusImagePaths(req.files || {});
    const imageRemoveFlags = parseBusImageRemoveFlags(req.body || {});

    const hasBusPhoneInput = req.body?.phone !== undefined || req.body?.busPhone !== undefined || req.body?.contactNumber !== undefined;
    if (hasBusPhoneInput) {
      updates.phone = toSafeText(req.body?.phone || req.body?.busPhone || req.body?.contactNumber) || undefined;
    }

    delete updates.busPhone;
    delete updates.contactNumber;
    delete updates.imageUrl;
    delete updates.images;
    delete updates.busImageUrl;
    delete updates.seatLayoutImageUrl;
    delete updates.sleeperLayoutImageUrl;
    delete updates.operator;
    delete updates.operatorEmail;
    delete updates.removeBusImage;
    delete updates.removeSeatLayoutImage;
    delete updates.removeSleeperLayoutImage;

    const { hasInput: hasPolicyInput, policies: policyPatch } = extractBusPolicies(req.body || {});
    const hasBusTypesInput = Object.prototype.hasOwnProperty.call(updates, "busTypes");

    if (hasBusTypesInput) {
      const busTypeParse = parseBusTypesInput(updates.busTypes);
      if (busTypeParse.ok === false) {
        return res.status(400).json({ message: busTypeParse.message || "Invalid busTypes payload" });
      }

      updates.busTypes = busTypeParse.value;
      const derivedCategory = deriveBusCategoryFromBusTypes(busTypeParse.value);
      updates.busCategory = derivedCategory;
      updates.type = busCategoryToLegacyType[derivedCategory] || "AC";
    }

    const requestedCategoryRaw = Object.prototype.hasOwnProperty.call(updates, "busCategory") ? updates.busCategory : updates.type;

    if (!hasBusTypesInput && requestedCategoryRaw !== undefined) {
      const normalizedCategory = normalizeBusCategory(requestedCategoryRaw);
      if (!normalizedCategory) {
        return res.status(400).json({ message: `busCategory must be one of ${BUS_CATEGORIES.join(", ")}` });
      }
      updates.busCategory = normalizedCategory;
      updates.type = busCategoryToLegacyType[normalizedCategory] || "AC";
      updates.busTypes = [...(categoryToDefaultBusTypes[normalizedCategory] || ["SINGLE_SEATER"])];
    }

    const deckParse = parseDecksInput(req.body?.decks);
    if (deckParse.hasInput && deckParse.ok === false) {
      return res.status(400).json({ message: deckParse.message || "Invalid decks payload" });
    }

    busPolicyFields.forEach((field) => {
      delete updates[field];
    });
    delete updates.policies;

    if (deckParse.hasInput && deckParse.ok) {
      updates.decks = deckParse.value;
      updates.totalSeats = deckParse.totalSeats;
    } else if (updates.totalSeats !== undefined && updates.totalSeats !== null && updates.totalSeats !== "") {
      updates.totalSeats = Number(updates.totalSeats);
      if (!Number.isFinite(updates.totalSeats) || updates.totalSeats < 1) {
        return res.status(400).json({ message: "totalSeats must be a positive number" });
      }
    }

    if (updates.vehicleNumber === "") updates.vehicleNumber = undefined;

    const existingBus = await Bus.findById(req.params.id);
    if (!existingBus) {
      return res.status(404).json({ message: "Bus not found" });
    }

    const operatorResolution = await resolveOperatorAssignment(req.body || {});
    if (operatorResolution.error) {
      return res.status(400).json({ message: operatorResolution.error });
    }
    if (operatorResolution.hasInput) {
      updates.operator = operatorResolution.operatorId;
    }

    const existingImages = {
      ...(existingBus?.images && typeof existingBus.images === "object" ? existingBus.images : {}),
      bus: normalizeImagePath(existingBus?.images?.bus || existingBus?.imageUrl),
    };

    const nextImages = mergeBusImages({
      baseImages: existingImages,
      body: req.body || {},
      uploadedImages,
      removeFlags: imageRemoveFlags,
    });

    updates.images = nextImages;
    updates.imageUrl = nextImages.bus || undefined;

    if (hasPolicyInput) {
      updates.policies = {
        refundPolicy: toSafeText(policyPatch.refundPolicy ?? existingBus?.policies?.refundPolicy),
        cancellationPolicy: toSafeText(policyPatch.cancellationPolicy ?? existingBus?.policies?.cancellationPolicy),
        dateChangePolicy: toSafeText(policyPatch.dateChangePolicy ?? existingBus?.policies?.dateChangePolicy),
        luggagePolicy: toSafeText(policyPatch.luggagePolicy ?? existingBus?.policies?.luggagePolicy),
      };
    }

    const bus = await Bus.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!bus) {
      return res.status(404).json({ message: "Bus not found" });
    }

    await cleanupReplacedBusImages({
      previousImages: existingImages,
      nextImages,
    });

    res.json(withBusImageCompatibility(bus));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.deleteBus = async (req, res) => {
  try {
    const bus = await Bus.findById(req.params.id);
    if (!bus) {
      return res.status(404).json({ message: "Bus not found" });
    }

    if (bus.isActive === false) {
      return res.json({ message: "Bus already deleted" });
    }

    bus.isActive = false;
    await bus.save();

    await Schedule.updateMany(
      { bus: bus._id },
      { $set: { isActive: false } }
    );

    res.json({ message: "Deleted" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const sortRoutePoints = (points) =>
  [...(Array.isArray(points) ? points : [])].sort((a, b) => {
    const aOrder = Number(a?.order);
    const bOrder = Number(b?.order);
    const safeA = Number.isFinite(aOrder) && aOrder > 0 ? aOrder : Number.MAX_SAFE_INTEGER;
    const safeB = Number.isFinite(bOrder) && bOrder > 0 ? bOrder : Number.MAX_SAFE_INTEGER;
    if (safeA !== safeB) return safeA - safeB;
    return String(a?.name || "").localeCompare(String(b?.name || ""), undefined, { sensitivity: "base" });
  });

const buildCityLookupByKey = async (names) => {
  const keys = Array.from(new Set((Array.isArray(names) ? names : [])
    .map((name) => stopKey(name))
    .filter(Boolean)));

  if (keys.length === 0) return new Map();

  const cities = await City.find({ key: { $in: keys } })
    .populate("district", "_id name key")
    .select("_id name key district")
    .lean();

  const map = new Map();
  cities.forEach((city) => {
    const key = stopKey(city?.key || city?.name);
    if (!key || map.has(key)) return;
    map.set(key, city);
  });
  return map;
};

const validateLaneDistrict = ({ laneName, points, districtId, districtName, cityByKey }) => {
  const lanePoints = Array.isArray(points) ? points : [];
  const expectedDistrictId = String(districtId || "");

  for (const point of lanePoints) {
    const name = normalizeText(point?.name);
    const key = stopKey(name);
    if (!name || !key) {
      return { ok: false, message: `${laneName} point name is required` };
    }

    const city = cityByKey.get(key);
    if (!city) {
      return { ok: false, message: `${laneName} point not found as city: ${name}` };
    }

    const cityDistrictId = String(city?.district?._id || city?.district || "");
    if (!expectedDistrictId || cityDistrictId !== expectedDistrictId) {
      return {
        ok: false,
        message: `${laneName} point must belong to ${districtName}: ${name}`,
      };
    }
  }

  return { ok: true };
};

const deriveRoutePointLanesFromLegacyStops = ({ legacyStops, sourceCity, destinationCity, cityByKey }) => {
  const sourceName = normalizeText(sourceCity?.name);
  const destinationName = normalizeText(destinationCity?.name);
  const sourceDistrictId = String(sourceCity?.district?._id || "");
  const destinationDistrictId = String(destinationCity?.district?._id || "");

  const addUnique = (list, point) => {
    const key = stopKey(point?.name);
    if (!key) return;
    if (list.some((entry) => stopKey(entry?.name) === key)) return;
    list.push(point);
  };

  const boardingPoints = [];
  const droppingPoints = [];

  if (sourceName) {
    addUnique(boardingPoints, { name: sourceName, time: "00:00", order: 1 });
  }

  (Array.isArray(legacyStops) ? legacyStops : []).forEach((stop, idx) => {
    const name = normalizeText(stop?.name);
    if (!name) return;
    const key = stopKey(name);
    const city = cityByKey.get(key);
    if (!city) return;

    const districtId = String(city?.district?._id || city?.district || "");
    const order = Number.isFinite(Number(stop?.order)) && Number(stop.order) > 0
      ? Math.trunc(Number(stop.order))
      : idx + 2;

    if (districtId === sourceDistrictId) {
      addUnique(boardingPoints, { name, time: "00:00", order });
      return;
    }

    if (districtId === destinationDistrictId) {
      addUnique(droppingPoints, { name, time: "00:00", order: Math.max(1, order - 1) });
    }
  });

  if (destinationName) {
    addUnique(droppingPoints, { name: destinationName, time: "00:00", order: droppingPoints.length + 1 });
  }

  return {
    boardingPoints: sortRoutePoints(boardingPoints),
    droppingPoints: sortRoutePoints(droppingPoints),
  };
};

const normalizeAndValidateRoutePointLanes = async ({ body, sourceCity, destinationCity, distance, existingRoute }) => {
  const fallbackStopsSource = body?.stops !== undefined ? body.stops : existingRoute?.stops;
  const normalizedLegacyStops = normalizeLegacyRouteStops({
    stops: fallbackStopsSource,
    source: sourceCity?.name,
    destination: destinationCity?.name,
    distance,
  });

  if (!normalizedLegacyStops.ok) {
    return { ok: false, message: normalizedLegacyStops.message };
  }

  const normalizedBoarding = normalizeRoutePointList(body?.boardingPoints, { requireTime: true });
  if (!normalizedBoarding.ok) {
    return { ok: false, message: `boardingPoints: ${normalizedBoarding.message}` };
  }

  const normalizedDropping = normalizeRoutePointList(body?.droppingPoints, { requireTime: true });
  if (!normalizedDropping.ok) {
    return { ok: false, message: `droppingPoints: ${normalizedDropping.message}` };
  }

  let boardingPoints = normalizedBoarding.value;
  let droppingPoints = normalizedDropping.value;

  const namesForLookup = [];
  (Array.isArray(boardingPoints) ? boardingPoints : []).forEach((point) => namesForLookup.push(point.name));
  (Array.isArray(droppingPoints) ? droppingPoints : []).forEach((point) => namesForLookup.push(point.name));

  const shouldDeriveFromLegacy = (!Array.isArray(boardingPoints) || !Array.isArray(droppingPoints));
  if (shouldDeriveFromLegacy) {
    namesForLookup.push(sourceCity?.name, destinationCity?.name);
    (Array.isArray(normalizedLegacyStops.value) ? normalizedLegacyStops.value : []).forEach((stop) => namesForLookup.push(stop?.name));
  }

  const cityByKey = await buildCityLookupByKey(namesForLookup);

  if (shouldDeriveFromLegacy) {
    const derivedLanes = deriveRoutePointLanesFromLegacyStops({
      legacyStops: normalizedLegacyStops.value,
      sourceCity,
      destinationCity,
      cityByKey,
    });

    if (!Array.isArray(boardingPoints)) boardingPoints = derivedLanes.boardingPoints;
    if (!Array.isArray(droppingPoints)) droppingPoints = derivedLanes.droppingPoints;
  }

  const sourceName = normalizeText(sourceCity?.name);
  const destinationName = normalizeText(destinationCity?.name);

  if (!Array.isArray(boardingPoints) || boardingPoints.length === 0) {
    boardingPoints = sourceName ? [{ name: sourceName, time: "00:00", order: 1 }] : [];
  }

  if (!Array.isArray(droppingPoints) || droppingPoints.length === 0) {
    droppingPoints = destinationName ? [{ name: destinationName, time: "00:00", order: 1 }] : [];
  }

  if (sourceName && !boardingPoints.some((point) => stopKey(point?.name) === stopKey(sourceName))) {
    boardingPoints.push({ name: sourceName, time: "00:00", order: 1 });
  }

  if (destinationName && !droppingPoints.some((point) => stopKey(point?.name) === stopKey(destinationName))) {
    droppingPoints.push({ name: destinationName, time: "00:00", order: droppingPoints.length + 1 });
  }

  boardingPoints = sortRoutePoints(boardingPoints);
  droppingPoints = sortRoutePoints(droppingPoints);

  const validationCityByKey = await buildCityLookupByKey([
    ...boardingPoints.map((point) => point.name),
    ...droppingPoints.map((point) => point.name),
  ]);

  const boardingValidation = validateLaneDistrict({
    laneName: "Boarding point",
    points: boardingPoints,
    districtId: sourceCity?.district?._id,
    districtName: sourceCity?.district?.name || "source district",
    cityByKey: validationCityByKey,
  });
  if (!boardingValidation.ok) return boardingValidation;

  const droppingValidation = validateLaneDistrict({
    laneName: "Dropping point",
    points: droppingPoints,
    districtId: destinationCity?.district?._id,
    districtName: destinationCity?.district?.name || "destination district",
    cityByKey: validationCityByKey,
  });
  if (!droppingValidation.ok) return droppingValidation;

  return {
    ok: true,
    boardingPoints,
    droppingPoints,
    stops: Array.isArray(normalizedLegacyStops.value) ? normalizedLegacyStops.value : (Array.isArray(existingRoute?.stops) ? existingRoute.stops : []),
  };
};

// ROUTE
exports.createRoute = async (req, res) => {
  try {
    const body = { ...req.body };

    if (body.sourceDistrict !== undefined || body.destinationDistrict !== undefined) {
      return res.status(400).json({
        message: "sourceDistrict and destinationDistrict are derived automatically and must not be sent",
      });
    }

    const sourceInput = body.sourceCityId || body.sourceCity || body.source;
    const destinationInput = body.destinationCityId || body.destinationCity || body.destination;
    const [sourceCity, destinationCity] = await Promise.all([
      resolveCityForRoute(sourceInput),
      resolveCityForRoute(destinationInput),
    ]);

    if (!sourceCity || !destinationCity || !sourceCity.district || !destinationCity.district) {
      const message = await buildInvalidRouteCityMessage({
        sourceInput,
        destinationInput,
        sourceCity,
        destinationCity,
      });
      return res.status(400).json({ message });
    }
    if (String(sourceCity._id) === String(destinationCity._id)) {
      return res.status(400).json({ message: "source and destination must be different cities" });
    }

    const distance =
      body.distance !== undefined && body.distance !== null && body.distance !== "" ? Number(body.distance) : NaN;
    if (!Number.isFinite(distance) || distance <= 0) {
      return res.status(400).json({ message: "distance must be a positive number" });
    }

    const normalizedLanes = await normalizeAndValidateRoutePointLanes({
      body,
      sourceCity,
      destinationCity,
      distance,
      existingRoute: null,
    });
    if (!normalizedLanes.ok) {
      return res.status(400).json({ message: normalizedLanes.message });
    }

    const route = await Route.create({
      sourceCity: sourceCity._id,
      destinationCity: destinationCity._id,
      sourceDistrict: sourceCity.district.name,
      destinationDistrict: destinationCity.district.name,
      source: sourceCity.name,
      destination: destinationCity.name,
      distance,
      boardingPoints: normalizedLanes.boardingPoints,
      droppingPoints: normalizedLanes.droppingPoints,
      stops: normalizedLanes.stops,
    });

    await Stop.findOneAndUpdate(
      { route: route._id, cityKey: stopKey(destinationCity.name) },
      {
        $set: {
          route: route._id,
          city: destinationCity._id,
          cityRef: destinationCity._id,
          cityName: destinationCity.name,
          cityKey: stopKey(destinationCity.name),
          district: destinationCity.district.name,
          districtKey: stopKey(destinationCity.district.key || destinationCity.district.name),
          type: "drop",
          order: 9999,
          offsetMinutes: null,
          absoluteTime: "",
        },
      },
      { upsert: true, new: true }
    );

    res.status(201).json(withRoutePointCompatibility(route));
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({ message: "Route already exists between selected cities" });
    }
    res.status(500).json({ message: e.message });
  }
};

exports.getRoutes = async (req, res) => {
  const routes = await Route.find().lean();
  res.json(routes.map((route) => withRoutePointCompatibility(route)));
};

exports.updateRoute = async (req, res) => {
  try {
    const existing = await Route.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Route not found" });

    const body = { ...req.body };
    if (body.sourceDistrict !== undefined || body.destinationDistrict !== undefined) {
      return res.status(400).json({
        message: "sourceDistrict and destinationDistrict are derived automatically and must not be sent",
      });
    }

    const sourceInput =
      body.sourceCityId || body.sourceCity || body.source || existing.sourceCity || existing.source;
    const destinationInput =
      body.destinationCityId || body.destinationCity || body.destination || existing.destinationCity || existing.destination;

    const [sourceCity, destinationCity] = await Promise.all([
      resolveCityForRoute(sourceInput),
      resolveCityForRoute(destinationInput),
    ]);
    if (!sourceCity || !destinationCity || !sourceCity.district || !destinationCity.district) {
      const message = await buildInvalidRouteCityMessage({
        sourceInput,
        destinationInput,
        sourceCity,
        destinationCity,
      });
      return res.status(400).json({ message });
    }

    const nextSource = String(sourceCity.name || "").trim();
    const nextDestination = String(destinationCity.name || "").trim();
    const nextDistance =
      body.distance !== undefined && body.distance !== null && body.distance !== "" ? Number(body.distance) : Number(existing.distance);

    if (!nextSource || !nextDestination) {
      return res.status(400).json({ message: "source and destination are required" });
    }
    if (String(sourceCity._id) === String(destinationCity._id)) {
      return res.status(400).json({ message: "source and destination must be different cities" });
    }
    if (!Number.isFinite(nextDistance) || nextDistance <= 0) {
      return res.status(400).json({ message: "distance must be a positive number" });
    }

    const updates = {
      ...body,
      sourceCity: sourceCity._id,
      destinationCity: destinationCity._id,
      sourceDistrict: sourceCity.district.name,
      destinationDistrict: destinationCity.district.name,
      source: nextSource,
      destination: nextDestination,
      distance: nextDistance,
    };
    delete updates.sourceCityId;
    delete updates.destinationCityId;

    const normalizedLanes = await normalizeAndValidateRoutePointLanes({
      body,
      sourceCity,
      destinationCity,
      distance: nextDistance,
      existingRoute: existing,
    });
    if (!normalizedLanes.ok) {
      return res.status(400).json({ message: normalizedLanes.message });
    }

    updates.boardingPoints = normalizedLanes.boardingPoints;
    updates.droppingPoints = normalizedLanes.droppingPoints;
    updates.stops = normalizedLanes.stops;

    const oldDestinationKey = stopKey(existing.destination);
    const route = await Route.findByIdAndUpdate(req.params.id, updates, { new: true });

    if (oldDestinationKey && oldDestinationKey !== stopKey(nextDestination)) {
      await Stop.deleteMany({ route: route._id, cityKey: oldDestinationKey, type: "drop" });
    }

    await Stop.findOneAndUpdate(
      { route: route._id, cityKey: stopKey(nextDestination) },
      {
        $set: {
          route: route._id,
          city: destinationCity._id,
          cityRef: destinationCity._id,
          cityName: nextDestination,
          cityKey: stopKey(nextDestination),
          district: destinationCity.district.name,
          districtKey: stopKey(destinationCity.district.key || destinationCity.district.name),
          type: "drop",
          order: 9999,
          offsetMinutes: null,
          absoluteTime: "",
        },
      },
      { upsert: true, new: true }
    );

    res.json(withRoutePointCompatibility(route));
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({ message: "Route already exists between selected cities" });
    }
    res.status(500).json({ message: e.message });
  }
};

exports.deleteRoute = async (req, res) => {
  try {
    const routeId = req.params.id;
    if (!mongoose.isValidObjectId(routeId)) {
      return res.status(400).json({ message: "Invalid route id" });
    }

    const route = await Route.findById(routeId).lean();
    if (!route) return res.status(404).json({ message: "Route not found" });

    const schedulesCount = await Schedule.countDocuments({ route: routeId });
    if (schedulesCount > 0) {
      return res.status(409).json({
        message: "Cannot delete route with active schedules. Remove schedules first.",
      });
    }

    await Promise.all([
      Stop.deleteMany({ route: routeId }),
      Route.findByIdAndDelete(routeId),
    ]);

    return res.json({ message: "Route deleted" });
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};

// SCHEDULE
exports.createSchedule = async (req, res) => {
  try {
    const body = { ...req.body };
    const deprecatedPriceFields = getProvidedDeprecatedSchedulePriceFields(body);
    if (deprecatedPriceFields.length > 0) {
      return res.status(400).json({
        message: `Schedule-level pricing fields are deprecated (${deprecatedPriceFields.join(", ")}). Configure fares in the bus seat layout.`,
      });
    }

    delete body.price;
    delete body.priceMin;
    delete body.priceMax;

    if (body.durationMinutes !== undefined && body.durationMinutes !== null && body.durationMinutes !== "") body.durationMinutes = Number(body.durationMinutes);

    delete body.womenOnlySeats;

    const boardingPoints = normalizeSchedulePointList(body.boardingPoints);
    if (boardingPoints === null) {
      return res.status(400).json({ message: "boardingPoints must be an array of {name,date,time,order?}" });
    }
    const droppingPoints = normalizeSchedulePointList(body.droppingPoints);
    if (droppingPoints === null) {
      return res.status(400).json({ message: "droppingPoints must be an array of {name,date,time,order?}" });
    }
    if (!Array.isArray(boardingPoints) || boardingPoints.length === 0) {
      return res.status(400).json({ message: "At least one boarding point is required" });
    }
    if (!Array.isArray(droppingPoints) || droppingPoints.length === 0) {
      return res.status(400).json({ message: "At least one dropping point is required" });
    }

    const [route, bus] = await Promise.all([
      Route.findById(body.route).lean(),
      Bus.findOne({ _id: body.bus, isActive: true }).select("_id").lean(),
    ]);
    if (!route) {
      return res.status(400).json({ message: "Route not found" });
    }
    if (!bus) {
      return res.status(400).json({ message: "Bus not found or inactive" });
    }
    const routeWithLanes = withRoutePointCompatibility(route);
    const boardingIndexByKey = buildPointLaneIndexByKey(routeWithLanes.boardingPoints);
    const droppingIndexByKey = buildPointLaneIndexByKey(routeWithLanes.droppingPoints);

    const boardingValidation = validatePointOrderAndTime(boardingPoints, boardingIndexByKey);
    if (!boardingValidation.ok) {
      return res.status(400).json({ message: `Boarding points: ${boardingValidation.message}` });
    }
    const droppingValidation = validatePointOrderAndTime(droppingPoints, droppingIndexByKey);
    if (!droppingValidation.ok) {
      return res.status(400).json({ message: `Dropping points: ${droppingValidation.message}` });
    }

    body.boardingPoints = boardingValidation.points;
    body.droppingPoints = droppingValidation.points;

    const schedule = await Schedule.create(body);
    res.status(201).json(schedule);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.updateSchedule = async (req, res) => {
  try {
    const body = { ...req.body };
    const existingSchedule = await Schedule.findById(req.params.id).select("route bus").lean();
    if (!existingSchedule) {
      return res.status(404).json({ message: "Schedule not found" });
    }

    const deprecatedPriceFields = getProvidedDeprecatedSchedulePriceFields(body);
    if (deprecatedPriceFields.length > 0) {
      return res.status(400).json({
        message: `Schedule-level pricing fields are deprecated (${deprecatedPriceFields.join(", ")}). Configure fares in the bus seat layout.`,
      });
    }

    delete body.price;
    delete body.priceMin;
    delete body.priceMax;

    if (body.durationMinutes !== undefined && body.durationMinutes !== null && body.durationMinutes !== "") body.durationMinutes = Number(body.durationMinutes);

    delete body.womenOnlySeats;

    const boardingPoints = normalizeSchedulePointList(body.boardingPoints);
    if (boardingPoints === null) {
      return res.status(400).json({ message: "boardingPoints must be an array of {name,date,time,order?}" });
    }
    const droppingPoints = normalizeSchedulePointList(body.droppingPoints);
    if (droppingPoints === null) {
      return res.status(400).json({ message: "droppingPoints must be an array of {name,date,time,order?}" });
    }
    if (!Array.isArray(boardingPoints) || boardingPoints.length === 0) {
      return res.status(400).json({ message: "At least one boarding point is required" });
    }
    if (!Array.isArray(droppingPoints) || droppingPoints.length === 0) {
      return res.status(400).json({ message: "At least one dropping point is required" });
    }

    const routeId = body.route || existingSchedule.route;
    const busId = body.bus || existingSchedule.bus;

    const [route, bus] = await Promise.all([
      Route.findById(routeId).lean(),
      Bus.findOne({ _id: busId, isActive: true }).select("_id").lean(),
    ]);
    if (!route) {
      return res.status(400).json({ message: "Route not found" });
    }
    if (!bus) {
      return res.status(400).json({ message: "Bus not found or inactive" });
    }

    body.route = routeId;
    body.bus = busId;
    const routeWithLanes = withRoutePointCompatibility(route);
    const boardingIndexByKey = buildPointLaneIndexByKey(routeWithLanes.boardingPoints);
    const droppingIndexByKey = buildPointLaneIndexByKey(routeWithLanes.droppingPoints);

    const boardingValidation = validatePointOrderAndTime(boardingPoints, boardingIndexByKey);
    if (!boardingValidation.ok) {
      return res.status(400).json({ message: `Boarding points: ${boardingValidation.message}` });
    }
    const droppingValidation = validatePointOrderAndTime(droppingPoints, droppingIndexByKey);
    if (!droppingValidation.ok) {
      return res.status(400).json({ message: `Dropping points: ${droppingValidation.message}` });
    }

    body.boardingPoints = boardingValidation.points;
    body.droppingPoints = droppingValidation.points;

    const schedule = await Schedule.findByIdAndUpdate(req.params.id, body, { new: true });
    res.json(schedule);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getSchedules = async (req, res) => {
  try {
    const todayDateKey = getTodayDateKey();
    const schedules = await Schedule.find({ isActive: { $ne: false }, date: { $gte: todayDateKey } })
      .populate({ path: "bus", match: { isActive: true } })
      .populate("route")
      .sort({ date: 1, time: 1 });

    const visibleSchedules = schedules.filter((schedule) => Boolean(schedule?.bus));
    res.json(visibleSchedules.map((schedule) => withSchedulePointCompatibility(schedule)));
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.deleteSchedule = async (req, res) => {
  try {
    await Schedule.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// USERS
exports.getUsers = async (req, res) => {
  const users = await User.find().select("-password");
  res.json(users);
};

exports.updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const updates = {};
    if (req.body?.name !== undefined) updates.name = toSafeText(req.body.name);
    if (req.body?.phone !== undefined) updates.phone = toSafeText(req.body.phone);
    if (req.body?.role !== undefined) {
      const role = toSafeText(req.body.role).toLowerCase();
      if (!userRoleSet.has(role)) {
        return res.status(400).json({ message: "Invalid role" });
      }
      updates.role = role;
    }
    if (req.body?.isActive !== undefined) {
      updates.isActive = Boolean(req.body.isActive);
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: "No valid fields provided" });
    }

    const user = await User.findByIdAndUpdate(userId, updates, {
      new: true,
      runValidators: true,
    }).select("-password -passwordResetToken -passwordResetExpires");

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
  } catch (e) {
    if (e?.code === 11000) {
      return res.status(409).json({ message: "Email already exists" });
    }
    res.status(500).json({ message: e.message });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const deleted = await User.findByIdAndDelete(userId).select("_id name email role");
    if (!deleted) return res.status(404).json({ message: "User not found" });

    res.json({ message: "User deleted", user: deleted });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getUserBookings = async (req, res) => {
  try {
    const userId = req.params.id;
    if (!mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ message: "Invalid user id" });
    }

    const bookings = await Booking.find({ user: userId })
      .sort({ createdAt: -1 })
      .populate({
        path: "schedule",
        select: "date time route bus",
        populate: [
          { path: "route", select: "source destination" },
          { path: "bus", select: "name vehicleNumber" },
        ],
      })
      .lean();

    const output = bookings.map((booking) => {
      const route = booking?.schedule?.route;
      const bus = booking?.schedule?.bus;
      const routeLabel = route
        ? `${toSafeText(route.source) || "Unknown"} -> ${toSafeText(route.destination) || "Unknown"}`
        : "Unknown -> Unknown";

      return {
        id: String(booking?._id || ""),
        route: routeLabel,
        bus: toSafeText(bus?.name) || "-",
        seats: Array.isArray(booking?.seats) ? booking.seats : [],
        totalPrice: Number(booking?.totalPrice) || 0,
        status: toSafeText(booking?.status) || "confirmed",
        date: booking?.createdAt || null,
      };
    });

    res.json(output);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// DASHBOARD
exports.getDashboardStats = async (req, res) => {
  try {
    const rangeWindow = parseRangeWindow(req.query?.range);
    const bookingMatch = {
      ...buildCreatedAtMatch(rangeWindow),
      ...bookingAnalyticsStatusMatch,
    };

    const todayDateKey = getTodayDateKey();
    const [totalBuses, scheduleSummaryRows, totalUsers, totalBookings] = await Promise.all([
      Bus.countDocuments({ isActive: true }),
      Schedule.aggregate([
        {
          $match: {
            isActive: { $ne: false },
            date: { $gte: todayDateKey },
          },
        },
        {
          $lookup: {
            from: "buses",
            localField: "bus",
            foreignField: "_id",
            as: "busDoc",
          },
        },
        { $unwind: "$busDoc" },
        { $match: { "busDoc.isActive": true } },
        {
          $group: {
            _id: null,
            totalSchedules: { $sum: 1 },
            routeIds: { $addToSet: "$route" },
          },
        },
      ]),
      countModelWithRange(User, rangeWindow),
      Booking.countDocuments(bookingMatch),
    ]);

    const scheduleSummary = scheduleSummaryRows[0] || {};
    const totalSchedules = Number(scheduleSummary.totalSchedules) || 0;
    const totalRoutes = Array.isArray(scheduleSummary.routeIds)
      ? scheduleSummary.routeIds.filter(Boolean).length
      : 0;

    res.json({
      totalBuses,
      totalRoutes,
      totalSchedules,
      totalUsers,
      totalBookings,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getMonthlyBookings = async (req, res) => {
  try {
    const rangeWindow = parseRangeWindow(req.query?.range);
    const bookingMatch = {
      ...buildCreatedAtMatch(rangeWindow),
      ...bookingAnalyticsStatusMatch,
    };

    const monthlyRows = await Booking.aggregate([
      {
        $match: bookingMatch,
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          bookings: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    const bookingsByMonthToken = new Map(
      monthlyRows.map((row) => [
        toMonthToken(Number(row?._id?.year), Number(row?._id?.month)),
        Number(row.bookings) || 0,
      ])
    );

    const monthlyData = buildMonthSeries(rangeWindow, bookingsByMonthToken, "bookings");

    res.json(monthlyData);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getTopRoutes = async (req, res) => {
  try {
    const rangeWindow = parseRangeWindow(req.query?.range);
    const limitRaw = Number(req.query?.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.trunc(limitRaw), 10) : 5;

    const bookingMatch = {
      ...buildCreatedAtMatch(rangeWindow),
      ...bookingAnalyticsStatusMatch,
    };

    const topRoutes = await Booking.aggregate([
      {
        $match: bookingMatch,
      },
      {
        $lookup: {
          from: "schedules",
          localField: "schedule",
          foreignField: "_id",
          as: "scheduleDoc",
        },
      },
      {
        $unwind: {
          path: "$scheduleDoc",
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $lookup: {
          from: "routes",
          localField: "scheduleDoc.route",
          foreignField: "_id",
          as: "routeDoc",
        },
      },
      {
        $unwind: {
          path: "$routeDoc",
          preserveNullAndEmptyArrays: false,
        },
      },
      {
        $group: {
          _id: "$routeDoc._id",
          source: { $first: "$routeDoc.source" },
          destination: { $first: "$routeDoc.destination" },
          bookings: { $sum: 1 },
        },
      },
      {
        $project: {
          _id: 0,
          route: {
            $concat: [
              { $ifNull: ["$source", "Unknown"] },
              " -> ",
              { $ifNull: ["$destination", "Unknown"] },
            ],
          },
          bookings: 1,
        },
      },
      { $sort: { bookings: -1, route: 1 } },
      { $limit: limit },
    ]);

    res.json(topRoutes);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getRevenue = async (req, res) => {
  try {
    const rangeWindow = parseRangeWindow(req.query?.range);
    const bookingMatch = {
      ...buildCreatedAtMatch(rangeWindow),
      ...bookingAnalyticsStatusMatch,
    };

    const monthlyRows = await Booking.aggregate([
      {
        $match: bookingMatch,
      },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          revenue: { $sum: { $ifNull: ["$totalPrice", 0] } },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    const revenueByMonthToken = new Map(
      monthlyRows.map((row) => [
        toMonthToken(Number(row?._id?.year), Number(row?._id?.month)),
        Number(row.revenue) || 0,
      ])
    );

    const monthlyRevenue = buildMonthSeries(rangeWindow, revenueByMonthToken, "revenue");
    const totalRevenue = monthlyRevenue.reduce((sum, point) => sum + (Number(point.revenue) || 0), 0);

    res.json({
      totalRevenue,
      monthlyRevenue,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getRecentBookings = async (req, res) => {
  try {
    const rangeWindow = parseRangeWindow(req.query?.range);
    const limitRaw = Number(req.query?.limit);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(Math.trunc(limitRaw), 20) : 10;

    const bookingMatch = {
      ...buildCreatedAtMatch(rangeWindow),
      ...bookingAnalyticsStatusMatch,
    };

    const bookings = await Booking.find(bookingMatch)
      .populate("user", "name email")
      .populate({
        path: "schedule",
        select: "route",
        populate: {
          path: "route",
          select: "source destination",
        },
      })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const recentBookings = bookings.map((booking) => {
      const routeDoc = booking?.schedule?.route;
      const routeLabel = routeDoc
        ? `${String(routeDoc.source || "Unknown").trim()} -> ${String(routeDoc.destination || "Unknown").trim()}`
        : "Unknown -> Unknown";
      const userLabel =
        String(booking?.user?.name || "").trim() || String(booking?.user?.email || "").trim() || "Guest";
      const seatLabel = Array.isArray(booking?.seats) && booking.seats.length > 0 ? booking.seats.join(", ") : "-";

      const totalPrice = Number(booking?.totalPrice);
      const seatsCount = Array.isArray(booking?.seats) ? booking.seats.length : 0;
      const pricePerSeat = Number(booking?.pricePerSeat) || 0;
      const effectivePrice = Number.isFinite(totalPrice) && totalPrice > 0 ? totalPrice : seatsCount * pricePerSeat;

      return {
        id: String(booking?._id || ""),
        user: userLabel,
        route: routeLabel,
        seat: seatLabel,
        price: Number.isFinite(effectivePrice) ? effectivePrice : 0,
        date: booking?.createdAt || null,
      };
    });

    res.json(recentBookings);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getNotifications = async (req, res) => {
  try {
    const limit = parsePositiveInt(req.query?.limit, { defaultValue: 20, min: 1, max: 100 });

    const totalSchedules = await Schedule.countDocuments({
      isActive: { $ne: false },
      date: { $gte: getTodayDateKey() },
    });
    if (totalSchedules === 0) {
      const existingSystemAlert = await Notification.findOne({
        targetRole: "admin",
        type: "system",
        "data.code": "no-schedules",
      }).lean();

      if (!existingSystemAlert) {
        await createAdminNotification({
          type: "system",
          title: "System alert",
          message: "No schedules are configured yet. Add schedules to start receiving bookings.",
          entityType: "system",
          entityId: null,
          data: { code: "no-schedules" },
        });
      }
    }

    const [items, unreadCount] = await Promise.all([
      Notification.find({ targetRole: "admin" })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean(),
      Notification.countDocuments({ targetRole: "admin", isRead: false }),
    ]);

    res.json({
      unreadCount,
      items,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.markNotificationRead = async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid notification id" });
    }

    const notification = await Notification.findByIdAndUpdate(
      id,
      { $set: { isRead: true } },
      { new: true }
    );

    if (!notification) return res.status(404).json({ message: "Notification not found" });

    const unreadCount = await Notification.countDocuments({ targetRole: "admin", isRead: false });

    res.json({
      item: notification,
      unreadCount,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.markAllNotificationsRead = async (req, res) => {
  try {
    await Notification.updateMany({ targetRole: "admin", isRead: false }, { $set: { isRead: true } });
    res.json({ unreadCount: 0 });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.searchAll = async (req, res) => {
  try {
    const q = toSafeText(req.query?.q);
    if (!q) {
      return res.json({ users: [], routes: [], bookings: [] });
    }

    const escaped = escapeRegex(q);
    const regex = new RegExp(escaped, "i");

    const [users, routes, bookingCandidates] = await Promise.all([
      User.find({
        $or: [{ name: regex }, { email: regex }, { phone: regex }],
      })
        .select("name email phone role")
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
      Route.find({
        $or: [{ source: regex }, { destination: regex }],
      })
        .select("source destination distance")
        .sort({ updatedAt: -1, createdAt: -1 })
        .limit(8)
        .lean(),
      Booking.find({
        $or: [{ "passenger.name": regex }, { status: regex }],
      })
        .sort({ createdAt: -1 })
        .limit(30)
        .populate("user", "name email")
        .populate({
          path: "schedule",
          select: "route",
          populate: { path: "route", select: "source destination" },
        })
        .lean(),
    ]);

    const bookings = bookingCandidates
      .map((booking) => {
        const userName = toSafeText(booking?.user?.name || booking?.user?.email || "Guest");
        const routeSource = toSafeText(booking?.schedule?.route?.source || "Unknown");
        const routeDestination = toSafeText(booking?.schedule?.route?.destination || "Unknown");
        const routeText = `${routeSource} -> ${routeDestination}`;
        const passengerName = toSafeText(booking?.passenger?.name);
        const idText = String(booking?._id || "");

        const haystack = `${userName} ${routeText} ${passengerName} ${idText}`.toLowerCase();
        if (!haystack.includes(q.toLowerCase())) return null;

        return {
          id: idText,
          user: userName || "Guest",
          route: routeText,
          status: toSafeText(booking?.status) || "confirmed",
          date: booking?.createdAt || null,
        };
      })
      .filter(Boolean)
      .slice(0, 8);

    res.json({
      users: users.map((user) => ({
        id: String(user._id),
        name: toSafeText(user.name) || "Unnamed",
        email: toSafeText(user.email),
        phone: toSafeText(user.phone),
        role: toSafeText(user.role),
      })),
      routes: routes.map((route) => ({
        id: String(route._id),
        route: `${toSafeText(route.source) || "Unknown"} -> ${toSafeText(route.destination) || "Unknown"}`,
        distance: Number(route.distance) || 0,
      })),
      bookings,
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getAdminBookings = async (req, res) => {
  try {
    const page = parsePositiveInt(req.query?.page, { defaultValue: 1, min: 1, max: 10000 });
    const limit = parsePositiveInt(req.query?.limit, { defaultValue: 10, min: 1, max: 50 });
    const q = toSafeText(req.query?.q);
    const status = toSafeText(req.query?.status).toLowerCase();
    const rangeWindow = parseRangeWindow(req.query?.range);

    const match = {
      ...buildCreatedAtMatch(rangeWindow),
    };
    if (status && status !== "all") {
      match.status = status;
    }

    const baseBookings = await Booking.find(match)
      .sort({ createdAt: -1 })
      .populate("user", "name email phone")
      .populate({
        path: "schedule",
        select: "date time route bus",
        populate: [
          { path: "route", select: "source destination" },
          { path: "bus", select: "name vehicleNumber" },
        ],
      })
      .lean();

    const filtered = baseBookings.filter((booking) => {
      if (!q) return true;
      const routeText = `${toSafeText(booking?.schedule?.route?.source)} ${toSafeText(booking?.schedule?.route?.destination)}`;
      const busText = toSafeText(booking?.schedule?.bus?.name);
      const userText = `${toSafeText(booking?.user?.name)} ${toSafeText(booking?.user?.email)} ${toSafeText(booking?.user?.phone)}`;
      const passengerText = toSafeText(booking?.passenger?.name);
      const bookingIdText = String(booking?._id || "");
      const haystack = `${routeText} ${busText} ${userText} ${passengerText} ${bookingIdText}`.toLowerCase();
      return haystack.includes(q.toLowerCase());
    });

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * limit;
    const end = start + limit;

    const rows = filtered.slice(start, end).map((booking) => {
      const route = booking?.schedule?.route;
      const bus = booking?.schedule?.bus;
      const routeLabel = route
        ? `${toSafeText(route.source) || "Unknown"} -> ${toSafeText(route.destination) || "Unknown"}`
        : "Unknown -> Unknown";

      const seatNumbers = Array.isArray(booking?.seats) ? booking.seats : [];
      const seatText = seatNumbers.length > 0 ? seatNumbers.join(", ") : "-";
      const pickupLocation = toSafeText(booking?.boardingPoint?.name) || "-";
      const userName = toSafeText(booking?.user?.name) || toSafeText(booking?.user?.email) || "Guest";
      const phone = toSafeText(booking?.user?.phone) || toSafeText(booking?.passenger?.phone) || "-";
      const totalPrice = Number(booking?.totalPrice);
      const pricePerSeat = Number(booking?.pricePerSeat) || 0;
      const price = Number.isFinite(totalPrice) && totalPrice > 0 ? totalPrice : pricePerSeat * seatNumbers.length;

      return {
        id: String(booking?._id || ""),
        userName,
        phone,
        route: routeLabel,
        busName: toSafeText(bus?.name) || "-",
        seatNumber: seatText,
        pickupLocation,
        price: Number.isFinite(price) ? price : 0,
        date: booking?.createdAt || null,
        status: toSafeText(booking?.status) || "confirmed",
        details: {
          bookingId: String(booking?._id || ""),
          userName,
          email: toSafeText(booking?.user?.email),
          phone,
          passengerName: toSafeText(booking?.passenger?.name),
          route: routeLabel,
          busName: toSafeText(bus?.name) || "-",
          vehicleNumber: toSafeText(bus?.vehicleNumber) || "-",
          seatNumber: seatText,
          pickupLocation,
          droppingLocation: toSafeText(booking?.droppingPoint?.name) || "-",
          status: toSafeText(booking?.status) || "confirmed",
          price: Number.isFinite(price) ? price : 0,
          date: booking?.createdAt || null,
        },
      };
    });

    res.json({
      items: rows,
      pagination: {
        page: safePage,
        limit,
        total,
        totalPages,
      },
    });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.cancelBookingByAdmin = async (req, res) => {
  try {
    const bookingId = req.params.id;
    if (!mongoose.isValidObjectId(bookingId)) {
      return res.status(400).json({ message: "Invalid booking id" });
    }

    const booking = await Booking.findById(bookingId)
      .populate("user", "name email")
      .populate({
        path: "schedule",
        select: "route",
        populate: { path: "route", select: "source destination" },
      });

    if (!booking) return res.status(404).json({ message: "Booking not found" });

    if (booking.status === "cancelled") {
      return res.json({ message: "Booking already cancelled", booking });
    }

    booking.status = "cancelled";
    if (booking.payment) {
      booking.payment.status = "failed";
    }
    await booking.save();

    const route = booking?.schedule?.route;
    const routeLabel = route
      ? `${toSafeText(route.source) || "Unknown"} -> ${toSafeText(route.destination) || "Unknown"}`
      : "Unknown -> Unknown";
    const userLabel = toSafeText(booking?.user?.name) || toSafeText(booking?.user?.email) || "Guest";

    await createAdminNotification({
      type: "cancellation",
      title: "Booking cancelled",
      message: `Booking for ${userLabel} on ${routeLabel} was cancelled by admin.`,
      entityType: "booking",
      entityId: booking._id,
      data: {
        bookingId: String(booking._id),
        status: "cancelled",
      },
    });

    res.json({ message: "Booking cancelled", booking });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const damerauLevenshteinDistance = (left, right) => {
  const a = String(left || "");
  const b = String(right || "");

  if (!a) return b.length;
  if (!b) return a.length;

  const matrix = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));

  for (let i = 0; i <= a.length; i += 1) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j += 1) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );

      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, matrix[i - 2][j - 2] + 1);
      }

      matrix[i][j] = best;
    }
  }

  return matrix[a.length][b.length];
};

const getCityFuzzyThreshold = (inputKey) => {
  if (!inputKey) return 0;
  if (inputKey.length >= 8) return 2;
  return 1;
};

const rankCityMatches = async (value) => {
  const input = String(value || "").trim();
  const inputKey = stopKey(input);
  if (!input || !inputKey) return [];

  const cities = await City.find({}).select("name key district").populate("district");

  const ranked = [];
  for (const city of cities) {
    const cityKey = stopKey(city?.key || city?.name);
    if (!cityKey) continue;

    ranked.push({
      city,
      distance: damerauLevenshteinDistance(inputKey, cityKey),
      lengthDelta: Math.abs(inputKey.length - cityKey.length),
    });
  }

  ranked.sort((a, b) => {
    if (a.distance !== b.distance) return a.distance - b.distance;
    if (a.lengthDelta !== b.lengthDelta) return a.lengthDelta - b.lengthDelta;
    return String(a.city?.name || "").localeCompare(String(b.city?.name || ""), undefined, {
      sensitivity: "base",
    });
  });

  return ranked;
};

const suggestCityNames = async (value, { limit = 3 } = {}) => {
  const inputKey = stopKey(String(value || "").trim());
  if (!inputKey) return [];

  const ranked = await rankCityMatches(value);
  const maxDistance = Math.max(2, getCityFuzzyThreshold(inputKey) + 1);

  return ranked
    .filter((item) => item.distance <= maxDistance)
    .slice(0, limit)
    .map((item) => String(item.city?.name || "").trim())
    .filter(Boolean)
    .filter((name, idx, arr) => arr.indexOf(name) === idx);
};

const buildInvalidRouteCityMessage = async ({ sourceInput, destinationInput, sourceCity, destinationCity }) => {
  const [sourceSuggestions, destinationSuggestions] = await Promise.all([
    sourceCity ? Promise.resolve([]) : suggestCityNames(sourceInput),
    destinationCity ? Promise.resolve([]) : suggestCityNames(destinationInput),
  ]);

  const issues = [];

  if (!sourceCity) {
    const sourceLabel = String(sourceInput || "").trim() || "(empty)";
    const suggestionText = sourceSuggestions.length > 0
      ? ` Did you mean ${sourceSuggestions.join(", ")}?`
      : "";
    issues.push(`Source city \"${sourceLabel}\" was not found.${suggestionText}`);
  } else if (!sourceCity.district) {
    issues.push(`Source city \"${sourceCity.name}\" has no district assigned`);
  }

  if (!destinationCity) {
    const destinationLabel = String(destinationInput || "").trim() || "(empty)";
    const suggestionText = destinationSuggestions.length > 0
      ? ` Did you mean ${destinationSuggestions.join(", ")}?`
      : "";
    issues.push(`Destination city \"${destinationLabel}\" was not found.${suggestionText}`);
  } else if (!destinationCity.district) {
    issues.push(`Destination city \"${destinationCity.name}\" has no district assigned`);
  }

  if (issues.length === 0) {
    return "source and destination must be valid cities with valid districts";
  }

  return issues.join(" ");
};

const resolveCityForRoute = async (value) => {
  if (!value) return null;

  if (mongoose.isValidObjectId(value)) {
    return City.findById(value).populate("district");
  }

  const cityName = String(value || "").trim();
  if (!cityName) return null;
  const cityKey = stopKey(cityName);

  const exactMatch = await City.findOne({
    $or: [{ key: cityKey }, { name: { $regex: new RegExp(`^${escapeRegex(cityName)}$`, "i") } }],
  }).populate("district");

  if (exactMatch) return exactMatch;

  const ranked = await rankCityMatches(cityName);
  const fuzzyThreshold = getCityFuzzyThreshold(cityKey);
  const fuzzyCandidates = ranked.filter((item) => item.distance <= fuzzyThreshold);

  if (fuzzyCandidates.length === 0) return null;
  if (fuzzyCandidates.length > 1 && fuzzyCandidates[0].distance === fuzzyCandidates[1].distance) {
    return null;
  }

  return fuzzyCandidates[0].city || null;
};
