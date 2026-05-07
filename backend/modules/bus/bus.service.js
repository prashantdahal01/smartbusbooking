const mongoose = require("mongoose");
const cloudinary = require("../../config/cloudinary");
const { ApiError } = require("../../utils/apiError");
const { Bus, Schedule, User } = require("./bus.model");

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
const BUS_IMAGE_TYPES = ["bus", "seatLayout", "sleeperLayout"];
const CLOUDINARY_HOST_RE = /(^|\.)cloudinary\.com$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

const normalizeSeatLabel = (value) => String(value || "").trim().toUpperCase().replace(/\s+/g, "");
const normalizeBusTypeValue = (value) => String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
const hasOwnProp = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);
const normalizeImagePath = (value) => String(value || "").trim();
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

const parseObjectId = (value) => {
  if (!mongoose.isValidObjectId(value)) return null;
  return new mongoose.Types.ObjectId(value);
};

const getTodayDateKey = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const BUS_TYPES_SET = new Set(Bus.BUS_TYPES || BUS_TYPES);
const SIMPLE_BUS_TYPE_MAP = {
  AC: ["AC", "SINGLE_SEATER"],
  NON_AC: ["SINGLE_SEATER"],
  SLEEPER: ["AC", "SLEEPER"],
};

const normalizeBusTypeToken = (value) =>
  String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

const normalizeSimpleType = (value) => {
  const token = normalizeBusTypeToken(value);
  if (!token) return null;
  if (token === "NON_AC" || token === "NONAC") return "NON_AC";
  if (token === "SLEEPER") return "SLEEPER";
  if (token === "AC") return "AC";
  return null;
};

const normalizeOperatorBusTypes = (rawTypes) => {
  if (!Array.isArray(rawTypes)) return null;

  const seen = new Set();
  const types = [];

  rawTypes.forEach((value) => {
    const token = normalizeBusTypeToken(value);
    if (!token || seen.has(token)) return;
    seen.add(token);
    types.push(token);
  });

  if (types.length === 0) return null;

  const invalid = types.find((type) => !BUS_TYPES_SET.has(type));
  if (invalid) {
    return { error: `Invalid bus type: ${invalid}` };
  }

  return types;
};

const parsePositiveInt = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
};

const parsePhone = (value) => {
  const phone = toSafeText(value);
  if (!phone) return "";
  const digitCount = phone.replace(/\D/g, "").length;
  return digitCount >= 7 ? phone : null;
};

const resolveBusTypesFromPayload = ({ body, partial }) => {
  if (body.busTypes !== undefined) {
    const normalized = normalizeOperatorBusTypes(body.busTypes);
    if (!normalized) return { ok: false, message: "busTypes must be a non-empty array" };
    if (normalized?.error) return { ok: false, message: normalized.error };
    return { ok: true, busTypes: normalized };
  }

  if (body.type !== undefined || !partial) {
    const simpleType = normalizeSimpleType(body.type || "AC");
    if (!simpleType) {
      return { ok: false, message: "type must be one of AC, NON_AC, or SLEEPER" };
    }
    return { ok: true, busTypes: SIMPLE_BUS_TYPE_MAP[simpleType] };
  }

  return { ok: true };
};

const parseOperatorBusPayload = ({ body = {}, partial = false } = {}) => {
  const payload = body || {};
  const updates = {};

  if (!partial || payload.name !== undefined) {
    const name = toSafeText(payload.name);
    if (!name) return { ok: false, message: "Bus name is required" };
    updates.name = name;
  }

  if (!partial || payload.vehicleNumber !== undefined) {
    const vehicleNumber = toSafeText(payload.vehicleNumber);
    if (!vehicleNumber) return { ok: false, message: "Bus number is required" };
    updates.vehicleNumber = vehicleNumber;
  }

  if (!partial || payload.phone !== undefined) {
    const parsedPhone = parsePhone(payload.phone);
    if (parsedPhone === null) {
      return { ok: false, message: "Phone number must contain at least 7 digits" };
    }
    if (!parsedPhone) {
      return { ok: false, message: "Operator contact phone is required" };
    }
    updates.phone = parsedPhone;
  }

  if (!partial || payload.totalSeats !== undefined) {
    const totalSeats = parsePositiveInt(payload.totalSeats);
    if (!totalSeats) {
      return { ok: false, message: "totalSeats must be a positive integer" };
    }
    updates.totalSeats = totalSeats;
  }

  const busTypeResult = resolveBusTypesFromPayload({ body: payload, partial });
  if (!busTypeResult.ok) return busTypeResult;
  if (Array.isArray(busTypeResult.busTypes)) {
    updates.busTypes = busTypeResult.busTypes;
  }

  return { ok: true, updates };
};

const getBuses = async ({ includeInactive = false } = {}) => {
  const match = includeInactive ? {} : { isActive: true };
  const buses = await Bus.find(match).populate("operator");
  return buses.map((bus) => withBusImageCompatibility(bus));
};

const getOperatorBuses = async ({ operatorId }) => {
  const operatorObjectId = parseObjectId(operatorId);
  if (!operatorObjectId) {
    throw new ApiError(401, "Unauthorized", null);
  }

  const buses = await Bus.find({ operator: operatorObjectId, isActive: true }).sort({ name: 1 }).lean();
  const busIds = buses.map((bus) => bus._id).filter(Boolean);
  const todayDateKey = getTodayDateKey();

  const scheduleCounts = busIds.length > 0
    ? await Schedule.aggregate([
      { $match: { bus: { $in: busIds }, isActive: { $ne: false }, date: { $gte: todayDateKey } } },
      { $group: { _id: "$bus", count: { $sum: 1 } } },
    ])
    : [];

  const countByBusId = new Map(
    scheduleCounts.map((item) => [String(item?._id), Number(item?.count) || 0])
  );

  return buses.map((bus) => ({
    ...bus,
    scheduleCount: countByBusId.get(String(bus._id)) || 0,
  }));
};

const createBus = async ({ body, files }) => {
  const { name, type, vehicleNumber } = body || {};
  const busPhone = toSafeText(body?.phone || body?.busPhone || body?.contactNumber);
  const operatorResolution = await resolveOperatorAssignment(body || {});
  if (operatorResolution.error) {
    throw new ApiError(400, operatorResolution.error, null);
  }

  const busTypeParse = parseBusTypesInput(body?.busTypes, body?.busCategory || type);
  if (busTypeParse.ok === false) {
    throw new ApiError(400, busTypeParse.message || "Invalid busTypes payload", null);
  }

  const busTypes = Array.isArray(busTypeParse.value) ? busTypeParse.value : [];
  if (busTypes.length === 0) {
    throw new ApiError(400, "At least one bus type is required", null);
  }
  const busCategory = deriveBusCategoryFromBusTypes(busTypes);

  const deckParse = parseDecksInput(body?.decks);
  if (deckParse.hasInput && deckParse.ok === false) {
    throw new ApiError(400, deckParse.message || "Invalid decks payload", null);
  }

  const totalSeatsRaw = body?.totalSeats;
  let totalSeats = totalSeatsRaw !== undefined && totalSeatsRaw !== null && totalSeatsRaw !== "" ? Number(totalSeatsRaw) : undefined;

  if (deckParse.hasInput && deckParse.ok) {
    totalSeats = deckParse.totalSeats;
  }

  if (totalSeats !== undefined && (!Number.isFinite(totalSeats) || totalSeats < 1)) {
    throw new ApiError(400, "totalSeats must be a positive number", null);
  }
  if (!Number.isFinite(totalSeats) || totalSeats < 1) {
    throw new ApiError(400, "At least one seat must be configured via decks", null);
  }

  const uploadedImages = extractUploadedBusImagePaths(files || {});
  const images = mergeBusImages({
    baseImages: { bus: body?.imageUrl },
    body: body || {},
    uploadedImages,
    removeFlags: {},
  });

  const { hasInput: hasPolicyInput, policies } = extractBusPolicies(body || {});

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

  return withBusImageCompatibility(bus);
};

const updateBus = async ({ busId, body, files }) => {
  const updates = { ...body };
  const uploadedImages = extractUploadedBusImagePaths(files || {});
  const imageRemoveFlags = parseBusImageRemoveFlags(body || {});

  const hasBusPhoneInput = body?.phone !== undefined || body?.busPhone !== undefined || body?.contactNumber !== undefined;
  if (hasBusPhoneInput) {
    updates.phone = toSafeText(body?.phone || body?.busPhone || body?.contactNumber) || undefined;
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

  const { hasInput: hasPolicyInput, policies: policyPatch } = extractBusPolicies(body || {});
  const hasBusTypesInput = Object.prototype.hasOwnProperty.call(updates, "busTypes");

  if (hasBusTypesInput) {
    const busTypeParse = parseBusTypesInput(updates.busTypes);
    if (busTypeParse.ok === false) {
      throw new ApiError(400, busTypeParse.message || "Invalid busTypes payload", null);
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
      throw new ApiError(400, `busCategory must be one of ${BUS_CATEGORIES.join(", ")}`, null);
    }
    updates.busCategory = normalizedCategory;
    updates.type = busCategoryToLegacyType[normalizedCategory] || "AC";
    updates.busTypes = [...(categoryToDefaultBusTypes[normalizedCategory] || ["SINGLE_SEATER"])];
  }

  const deckParse = parseDecksInput(body?.decks);
  if (deckParse.hasInput && deckParse.ok === false) {
    throw new ApiError(400, deckParse.message || "Invalid decks payload", null);
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
      throw new ApiError(400, "totalSeats must be a positive number", null);
    }
  }

  if (updates.vehicleNumber === "") updates.vehicleNumber = undefined;

  const existingBus = await Bus.findById(busId);
  if (!existingBus) {
    throw new ApiError(404, "Bus not found", null);
  }

  const operatorResolution = await resolveOperatorAssignment(body || {});
  if (operatorResolution.error) {
    throw new ApiError(400, operatorResolution.error, null);
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
    body: body || {},
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

  const bus = await Bus.findByIdAndUpdate(busId, updates, { new: true });
  if (!bus) {
    throw new ApiError(404, "Bus not found", null);
  }

  await cleanupReplacedBusImages({
    previousImages: existingImages,
    nextImages,
  });

  return withBusImageCompatibility(bus);
};

const deleteBus = async ({ busId }) => {
  const bus = await Bus.findById(busId);
  if (!bus) {
    throw new ApiError(404, "Bus not found", null);
  }

  if (bus.isActive === false) {
    return { message: "Bus already deleted" };
  }

  bus.isActive = false;
  await bus.save();

  await Schedule.updateMany(
    { bus: bus._id },
    { $set: { isActive: false } }
  );

  return { message: "Deleted" };
};

const assignOperator = async ({ busId, body }) => {
  if (!mongoose.isValidObjectId(busId)) {
    throw new ApiError(400, "Invalid bus id", null);
  }

  const operatorResolution = await resolveOperatorAssignment(body || {});
  if (operatorResolution.error) {
    throw new ApiError(400, operatorResolution.error, null);
  }

  const bus = await Bus.findByIdAndUpdate(
    busId,
    { operator: operatorResolution.operatorId || undefined },
    { new: true }
  );

  if (!bus) {
    throw new ApiError(404, "Bus not found", null);
  }

  return withBusImageCompatibility(bus);
};

const updateOperatorBus = async ({ operatorId, busId, body }) => {
  const operatorObjectId = parseObjectId(operatorId);
  if (!operatorObjectId) {
    throw new ApiError(401, "Unauthorized", null);
  }

  const busObjectId = parseObjectId(busId);
  if (!busObjectId) {
    throw new ApiError(400, "Invalid bus id", null);
  }

  const blockedFieldMessages = {
    totalSeats: "Only admin can modify seat capacity",
    decks: "Only admin can modify seat layout",
    seatLayout: "Only admin can modify seat layout",
    vehicleNumber: "Only admin can modify vehicle number",
  };

  const attemptedBlockedField = Object.keys(blockedFieldMessages).find((field) =>
    hasOwnProp(body, field)
  );

  if (attemptedBlockedField) {
    throw new ApiError(403, blockedFieldMessages[attemptedBlockedField], null);
  }

  const editablePayload = {};
  if (hasOwnProp(body, "name")) editablePayload.name = body.name;
  if (hasOwnProp(body, "type")) editablePayload.type = body.type;
  if (hasOwnProp(body, "busTypes")) editablePayload.busTypes = body.busTypes;
  if (hasOwnProp(body, "phone")) editablePayload.phone = body.phone;

  const parsed = parseOperatorBusPayload({ body: editablePayload, partial: true });
  if (!parsed.ok) {
    throw new ApiError(400, parsed.message || "Invalid bus payload", null);
  }

  if (Object.keys(parsed.updates).length === 0) {
    throw new ApiError(400, "No valid fields provided", null);
  }

  const bus = await Bus.findOneAndUpdate(
    { _id: busObjectId, operator: operatorObjectId },
    parsed.updates,
    { new: true, runValidators: true }
  );

  if (!bus) {
    throw new ApiError(404, "Bus not found", null);
  }

  return bus;
};

module.exports = {
  getBuses,
  getOperatorBuses,
  createBus,
  updateBus,
  deleteBus,
  assignOperator,
  updateOperatorBus,
};
