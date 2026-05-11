const mongoose = require("mongoose");
const { ApiError } = require("../../utils/apiError");
const { syncRoutePoints } = require("../../services/routePointSync.service");
const { Stop } = require("./stop.model");
const { City } = require("../location/location.model");
const { Route } = require("../route/route.model");

const normalizeKey = (value) => String(value || "").trim().toLowerCase();
const normalizeStopType = (value) => {
  const type = String(value || "pickup").trim().toLowerCase();
  if (type === "drop") return "drop";
  if (type === "both") return "both";
  return "pickup";
};
const stopTypeUsesPickupLane = (value) => {
  const type = normalizeStopType(value);
  return type === "pickup" || type === "both";
};
const stopTypeUsesDropLane = (value) => {
  const type = normalizeStopType(value);
  return type === "drop" || type === "both";
};
const sharesOrderLane = (leftType, rightType) => {
  if (stopTypeUsesPickupLane(leftType) && stopTypeUsesPickupLane(rightType)) return true;
  if (stopTypeUsesDropLane(leftType) && stopTypeUsesDropLane(rightType)) return true;
  return false;
};
const describeStopLane = (value) => {
  const type = normalizeStopType(value);
  if (type === "pickup") return "pickup";
  if (type === "drop") return "drop";
  return "pickup/drop";
};
const isValidTimeHHmm = (value) => /^\d{2}:\d{2}$/.test(String(value || "").trim());

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const parseOffsetMinutes = (value) => {
  if (value === undefined) return { provided: false, value: null };
  if (value === null || value === "") return { provided: true, value: null };
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return { provided: true, value: NaN };
  return { provided: true, value: Math.round(parsed) };
};

const resolveCityWithDistrict = async (cityInput) => {
  if (mongoose.isValidObjectId(cityInput)) {
    return City.findById(cityInput).populate("district");
  }

  const cityName = String(cityInput || "").trim();
  if (!cityName) return null;
  const cityKey = normalizeKey(cityName);
  return City.findOne({
    $or: [{ key: cityKey }, { name: { $regex: new RegExp(`^${escapeRegex(cityName)}$`, "i") } }],
  }).populate("district");
};

const getRouteStopsOrdered = async (routeId) =>
  Stop.find({ route: routeId }).sort({ order: 1, createdAt: 1, _id: 1 }).populate("cityRef", "name key district").lean();

const sortRouteLanePoints = (points) =>
  [...(Array.isArray(points) ? points : [])].sort((a, b) => {
    const aOrder = Number(a?.order);
    const bOrder = Number(b?.order);
    const safeA = Number.isFinite(aOrder) && aOrder > 0 ? aOrder : Number.MAX_SAFE_INTEGER;
    const safeB = Number.isFinite(bOrder) && bOrder > 0 ? bOrder : Number.MAX_SAFE_INTEGER;
    if (safeA !== safeB) return safeA - safeB;
    return String(a?.name || "").localeCompare(String(b?.name || ""), undefined, { sensitivity: "base" });
  });

const normalizeRouteLanePointOutput = (points) =>
  sortRouteLanePoints(points).map((point, idx) => {
    const orderRaw = Number(point?.order);
    const order = Number.isFinite(orderRaw) && orderRaw > 0 ? Math.trunc(orderRaw) : idx + 1;
    const timeRaw = String(point?.time || "").trim();
    return {
      name: String(point?.name || "").trim(),
      time: isValidTimeHHmm(timeRaw) ? timeRaw : "00:00",
      order,
    };
  }).filter((point) => point.name);

const syncRouteMidStops = async (route) => {
  if (!route?._id) return;
  await syncRoutePoints(route._id);
};

const parseStopInputs = (body) => {
  if (Array.isArray(body?.stops)) {
    return body.stops;
  }
  return [
    {
      city: body?.city || body?.cityId,
      type: body?.type,
      order: body?.order,
      offsetMinutes: body?.offsetMinutes,
      absoluteTime: body?.absoluteTime,
    },
  ];
};

/**
 * Get stops by route id.
 * @param {object} params
 * @param {string} params.routeId
 * @returns {Promise<object[]>} 
 */
const getStopsByRoute = async ({ routeId }) => {
  if (!mongoose.isValidObjectId(routeId)) {
    throw new ApiError(400, "Invalid route id", null);
  }

  return getRouteStopsOrdered(routeId);
};

/**
 * Reject auto-generation of stops.
 * @returns {Promise<object>} 
 */
const autoGenerateStops = async () => {
  return {
    message: "Bulk auto-generation is disabled. Destination drop stop is created automatically with route creation.",
  };
};

/**
 * Create one or more stops.
 * @param {object} params
 * @param {object} params.body
 * @returns {Promise<object|object[]>} 
 */
const createStop = async ({ body }) => {
  const safeBody = body || {};
  const routeId = safeBody.route || safeBody.routeId;
  if (!mongoose.isValidObjectId(routeId)) {
    throw new ApiError(400, "routeId is required", null);
  }

  const route = await Route.findById(routeId);
  if (!route) {
    throw new ApiError(404, "Route not found", null);
  }

  const inputStops = parseStopInputs(safeBody);
  if (!Array.isArray(inputStops) || inputStops.length === 0) {
    throw new ApiError(400, "At least one stop is required", null);
  }

  const existingRouteStops = await Stop.find({ route: route._id })
    .select("cityName cityKey order type")
    .lean();
  const existingCityByKey = new Map();
  const existingOrderClaims = [];

  for (const row of existingRouteStops) {
    const key = normalizeKey(row?.cityKey || row?.cityName || "");
    if (key && !existingCityByKey.has(key)) {
      existingCityByKey.set(key, row);
    }

    const order = Number(row?.order);
    if (!Number.isFinite(order) || !Number.isInteger(order) || order <= 0 || order >= 9999) continue;
    existingOrderClaims.push({
      order,
      type: normalizeStopType(row?.type),
      cityName: String(row?.cityName || "").trim(),
    });
  }

  const docsToInsert = [];
  const incomingCityKeys = new Set();
  const incomingOrderClaims = [];

  for (const rawStop of inputStops) {
    const cityInput = rawStop?.city || rawStop?.cityId || rawStop?.name;
    const cityDoc = await resolveCityWithDistrict(cityInput);
    if (!cityDoc || !cityDoc.district) {
      throw new ApiError(400, `City not found or missing district: ${cityInput}`, null);
    }

    const typeRaw = String(rawStop?.type ?? safeBody.type ?? "pickup").trim().toLowerCase();
    if (!["pickup", "drop", "both"].includes(typeRaw)) {
      throw new ApiError(400, "Manual stop type must be pickup, drop, or both", null);
    }
    const type = typeRaw;

    const cityName = String(cityDoc.name || "").trim();
    const cityKey = normalizeKey(cityDoc.key || cityDoc.name);
    const districtName = String(cityDoc.district?.name || "").trim();
    const districtKey = normalizeKey(cityDoc.district?.key || cityDoc.district?.name);

    if (!districtName) {
      throw new ApiError(400, `City has no valid district: ${cityName}`, null);
    }

    if (incomingCityKeys.has(cityKey)) {
      throw new ApiError(409, `Duplicate city in request: ${cityName}`, null);
    }
    if (existingCityByKey.has(cityKey)) {
      const conflictCity = existingCityByKey.get(cityKey);
      throw new ApiError(409, "Duplicate stop city for this route", {
        cities: [String(conflictCity?.cityName || cityName).trim()],
      });
    }
    incomingCityKeys.add(cityKey);

    const offset = parseOffsetMinutes(
      rawStop?.offsetMinutes !== undefined ? rawStop.offsetMinutes : safeBody.offsetMinutes
    );
    if (Number.isNaN(offset.value)) {
      throw new ApiError(400, `offsetMinutes must be a non-negative number for ${cityName}`, null);
    }

    const absoluteTime = String(
      rawStop?.absoluteTime !== undefined ? rawStop.absoluteTime : safeBody.absoluteTime || ""
    ).trim();
    if (absoluteTime && !isValidTimeHHmm(absoluteTime)) {
      throw new ApiError(400, `absoluteTime must be HH:mm for ${cityName}`, null);
    }

    let order = Number(rawStop?.order);
    if (!Number.isFinite(order)) {
      let next = 1;
      while (next < 9999) {
        const existingConflict = existingOrderClaims.some(
          (claim) => claim.order === next && sharesOrderLane(claim.type, type)
        );
        const incomingConflict = incomingOrderClaims.some(
          (claim) => claim.order === next && sharesOrderLane(claim.type, type)
        );
        if (!existingConflict && !incomingConflict) break;
        next += 1;
      }
      order = Math.min(next, 9998);
    }

    order = Math.trunc(order);
    if (!Number.isFinite(order) || order <= 0 || order >= 9999) {
      throw new ApiError(400, `order must be an integer between 1 and 9998 for ${cityName}`, null);
    }
    const incomingConflict = incomingOrderClaims.find(
      (claim) => claim.order === order && sharesOrderLane(claim.type, type)
    );
    if (incomingConflict) {
      throw new ApiError(409, `Order ${order} is already used in ${describeStopLane(type)} sequence by ${incomingConflict.cityName || "another stop"}`, null);
    }

    const existingConflict = existingOrderClaims.find(
      (claim) => claim.order === order && sharesOrderLane(claim.type, type)
    );
    if (existingConflict) {
      throw new ApiError(409, `Order ${order} is already used in ${describeStopLane(type)} sequence by ${existingConflict.cityName || "another stop"}`, null);
    }
    incomingOrderClaims.push({ order, type, cityName });

    docsToInsert.push({
      route: route._id,
      city: cityDoc._id,
      cityRef: cityDoc._id,
      cityName,
      cityKey,
      district: districtName,
      districtKey,
      type,
      order,
      offsetMinutes: offset.provided ? offset.value : null,
      absoluteTime: absoluteTime || "",
    });
  }

  const createdStops = await Stop.insertMany(docsToInsert, { ordered: true });
  await syncRouteMidStops(route);

  if (createdStops.length === 1) {
    return createdStops[0];
  }
  return createdStops;
};

/**
 * Update a stop.
 * @param {object} params
 * @param {string} params.stopId
 * @param {object} params.body
 * @returns {Promise<object>} 
 */
const updateStop = async ({ stopId, body }) => {
  if (!mongoose.isValidObjectId(stopId)) {
    throw new ApiError(400, "Invalid stop id", null);
  }

  const stop = await Stop.findById(stopId);
  if (!stop) {
    throw new ApiError(404, "Stop not found", null);
  }

  let nextType = normalizeStopType(stop.type);

  if (body?.type !== undefined) {
    const typeRaw = String(body.type || "").trim().toLowerCase();
    if (!["pickup", "drop", "both"].includes(typeRaw)) {
      throw new ApiError(400, "type must be pickup, drop, or both", null);
    }
    nextType = typeRaw;
  }

  let nextOrder = Number(stop.order);

  if (body?.order !== undefined) {
    const order = Math.trunc(Number(body.order));
    if (!Number.isFinite(order) || order <= 0 || order >= 9999) {
      throw new ApiError(400, "order must be an integer between 1 and 9998", null);
    }
    nextOrder = order;
  }

  if (body?.order !== undefined || body?.type !== undefined) {
    const conflicts = await Stop.find({
      route: stop.route,
      order: nextOrder,
      _id: { $ne: stop._id },
    })
      .select("_id cityName order type")
      .lean();

    const conflict = conflicts.find((row) => sharesOrderLane(row?.type, nextType));

    if (conflict) {
      throw new ApiError(409, `Order ${nextOrder} is already used in ${describeStopLane(nextType)} sequence by ${conflict.cityName || "another stop"}`, null);
    }
  }

  if (body?.type !== undefined) {
    stop.type = nextType;
  }

  if (body?.order !== undefined) {
    stop.order = nextOrder;
  }

  if (body?.offsetMinutes !== undefined) {
    const offset = parseOffsetMinutes(body.offsetMinutes);
    if (Number.isNaN(offset.value)) {
      throw new ApiError(400, "offsetMinutes must be non-negative", null);
    }
    stop.offsetMinutes = offset.value;
  }

  if (body?.absoluteTime !== undefined) {
    const absoluteTime = String(body.absoluteTime || "").trim();
    if (absoluteTime && !isValidTimeHHmm(absoluteTime)) {
      throw new ApiError(400, "absoluteTime must be HH:mm", null);
    }
    stop.absoluteTime = absoluteTime;
  }

  await stop.save();

  const route = await Route.findById(stop.route);
  await syncRouteMidStops(route);

  return stop;
};

/**
 * Delete a stop.
 * @param {object} params
 * @param {string} params.stopId
 * @returns {Promise<object>} 
 */
const deleteStop = async ({ stopId }) => {
  if (!mongoose.isValidObjectId(stopId)) {
    throw new ApiError(400, "Invalid stop id", null);
  }

  const stop = await Stop.findByIdAndDelete(stopId);
  if (!stop) {
    throw new ApiError(404, "Stop not found", null);
  }

  const route = await Route.findById(stop.route);
  await syncRouteMidStops(route);

  return { message: "Deleted" };
};

module.exports = {
  getStopsByRoute,
  autoGenerateStops,
  createStop,
  updateStop,
  deleteStop,
};
