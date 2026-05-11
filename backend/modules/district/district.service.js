const mongoose = require("mongoose");
const { ApiError } = require("../../utils/apiError");
const { syncRoutePoints, syncRoutePointsForIds } = require("../../services/routePointSync.service");
const { District, City, Route, Stop } = require("./district.model");

const { normalizeKey: normalizeKeyFromRoutePoints } = require("../../utils/routePoints");
// Use the routePoints normalizeKey which includes location aliases (kakarbhitta -> kakarvita)
const normalizeKey = normalizeKeyFromRoutePoints;
const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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
const isValidTimeHHmm = (value) => /^\d{2}:\d{2}$/.test(String(value || "").trim());

const toStopKmFromSource = (raw) => {
  if (!raw || typeof raw !== "object") return undefined;
  if (raw.kmFromSource !== undefined) return raw.kmFromSource;
  if (raw.distanceFromSourceKm !== undefined) return raw.distanceFromSourceKm;
  if (raw.km !== undefined) return raw.km;
  return undefined;
};

const normalizeCityNames = (cities) => {
  if (!Array.isArray(cities)) return { cities: null, duplicates: [] };
  const seen = new Set();
  const duplicates = new Set();
  const out = [];
  for (const raw of cities) {
    const name = String(typeof raw === "object" && raw !== null ? raw.name : raw || "").trim();
    if (!name) continue;
    const key = normalizeKey(name);
    if (!key) continue;
    if (seen.has(key)) {
      duplicates.add(name);
      continue;
    }
    seen.add(key);
    out.push({ name, key });
  }
  return { cities: out, duplicates: Array.from(duplicates) };
};

const toDistrictRef = (districtValue) => {
  if (!districtValue || typeof districtValue !== "object") return districtValue;
  return {
    _id: districtValue._id,
    name: districtValue.name,
    key: districtValue.key,
  };
};

const toCityResponse = (city) => ({
  _id: city._id,
  name: city.name,
  key: city.key,
  district: toDistrictRef(city.district),
});

const buildDistrictResponse = (district, cityDocs) => {
  const cityObjects = cityDocs.map(toCityResponse);
  return {
    _id: district._id,
    name: district.name,
    key: district.key,
    cities: cityObjects.map((city) => city.name),
    cityObjects,
    populatedCities: cityObjects,
  };
};

const getCityDocsForDistrict = async (districtId) =>
  City.find({ district: districtId }).populate("district", "name key").sort({ name: 1 }).lean();

const getDistrictWithCities = async (districtId) => {
  const district = await District.findById(districtId).lean();
  if (!district) return null;
  const cityDocs = await getCityDocsForDistrict(districtId);
  return buildDistrictResponse(district, cityDocs);
};

const getRouteStopsOrdered = async (routeId) =>
  Stop.find({ route: routeId }).sort({ order: 1, createdAt: 1, _id: 1 }).lean();

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

const syncRouteMidStopsForIds = async (routeIds) => {
  await syncRoutePointsForIds(routeIds);
};

const resolveCityConflictMessage = (existingCity) => {
  const districtName = String(existingCity?.district?.name || "").trim();
  if (!districtName) return `City ${existingCity.name} already exists`;
  return `City ${existingCity.name} already exists in district ${districtName}`;
};

const ensureDistrictExists = async (districtId) => {
  if (!mongoose.isValidObjectId(districtId)) return null;
  return District.findById(districtId);
};

const propagateDistrictRename = async ({ districtId, oldName, oldKey, newName, newKey }) => {
  const cityDocs = await City.find({ district: districtId }).select("_id").lean();
  const cityIds = cityDocs.map((city) => city._id);

  if (cityIds.length > 0) {
    const routes = await Route.find({
      $or: [{ sourceCity: { $in: cityIds } }, { destinationCity: { $in: cityIds } }],
    })
      .select("_id sourceCity destinationCity sourceDistrict destinationDistrict")
      .lean();

    const routeUpdates = [];
    for (const route of routes) {
      const set = {};
      const sourceId = String(route.sourceCity || "");
      const destinationId = String(route.destinationCity || "");
      const belongsSource = cityIds.some((id) => String(id) === sourceId);
      const belongsDestination = cityIds.some((id) => String(id) === destinationId);

      if (belongsSource || normalizeKey(route.sourceDistrict) === normalizeKey(oldName)) {
        set.sourceDistrict = newName;
      }
      if (belongsDestination || normalizeKey(route.destinationDistrict) === normalizeKey(oldName)) {
        set.destinationDistrict = newName;
      }

      if (Object.keys(set).length > 0) {
        routeUpdates.push({
          updateOne: {
            filter: { _id: route._id },
            update: { $set: set },
          },
        });
      }
    }

    if (routeUpdates.length > 0) {
      await Route.bulkWrite(routeUpdates);
    }
  }

  const stopFilter = {
    $or: [
      { districtKey: oldKey },
      { district: oldName },
      ...(cityIds.length > 0 ? [{ cityRef: { $in: cityIds } }] : []),
    ],
  };

  await Stop.updateMany(stopFilter, {
    $set: {
      district: newName,
      districtKey: newKey,
    },
  });
};

const propagateCityRename = async ({ cityId, oldName, oldKey, newName, newKey, districtName, districtKey }) => {
  const routes = await Route.find({
    $or: [{ sourceCity: cityId }, { destinationCity: cityId }],
  })
    .select("_id sourceCity destinationCity")
    .lean();

  const routeUpdates = [];
  for (const route of routes) {
    const set = {};
    if (String(route.sourceCity) === String(cityId)) {
      set.source = newName;
      set.sourceDistrict = districtName;
    }
    if (String(route.destinationCity) === String(cityId)) {
      set.destination = newName;
      set.destinationDistrict = districtName;
    }
    if (Object.keys(set).length > 0) {
      routeUpdates.push({
        updateOne: {
          filter: { _id: route._id },
          update: { $set: set },
        },
      });
    }
  }

  if (routeUpdates.length > 0) {
    await Route.bulkWrite(routeUpdates);
  }

  const stopFilter = {
    $or: [
      { cityRef: cityId },
      { cityKey: oldKey },
      { cityName: { $regex: new RegExp(`^${escapeRegex(oldName)}$`, "i") } },
    ],
  };

  const affectedRouteIds = await Stop.distinct("route", stopFilter);

  await Stop.updateMany(stopFilter, {
    $set: {
      city: cityId,
      cityRef: cityId,
      cityName: newName,
      cityKey: newKey,
      district: districtName,
      districtKey: districtKey,
    },
  });

  await syncRouteMidStopsForIds(affectedRouteIds);
};

/**
 * Create a district with its cities.
 * @param {object} params
 * @param {object} params.body
 * @returns {Promise<object>} 
 */
const createDistrictWithCities = async ({ body }) => {
  let createdDistrictId = null;
  try {
    const districtName = String(body?.district || body?.name || "").trim();
    const districtKey = normalizeKey(districtName);
    const { cities: normalizedCities, duplicates: duplicateCities } = normalizeCityNames(body?.cities);

    if (!districtName) {
      throw new ApiError(400, "district is required", null);
    }
    if (normalizedCities === null) {
      throw new ApiError(400, "cities must be an array", null);
    }
    if (duplicateCities.length > 0) {
      throw new ApiError(400, `Duplicate cities in request: ${duplicateCities.join(", ")}`, null);
    }
    if (normalizedCities.length === 0) {
      throw new ApiError(400, "at least one city is required", null);
    }

    const existingDistrict = await District.findOne({ key: districtKey }).lean();
    if (existingDistrict) {
      throw new ApiError(409, `District ${districtName} already exists`, null);
    }

    const cityKeys = normalizedCities.map((city) => city.key);
    const existingCities = await City.find({ key: { $in: cityKeys } })
      .populate("district", "name key")
      .select("name key district")
      .lean();

    if (existingCities.length > 0) {
      const collisions = existingCities
        .map((city) => `${city.name}${city?.district?.name ? ` (${city.district.name})` : ""}`)
        .join(", ");
      throw new ApiError(409, `City already exists: ${collisions}`, null);
    }

    const district = await District.create({ name: districtName, key: districtKey });
    createdDistrictId = district._id;

    await City.insertMany(
      normalizedCities.map((city) => ({
        name: city.name,
        key: city.key,
        district: district._id,
      })),
      { ordered: true }
    );

    const [districtDoc, cityDocs] = await Promise.all([
      District.findById(district._id).lean(),
      getCityDocsForDistrict(district._id),
    ]);

    createdDistrictId = null;
    return buildDistrictResponse(districtDoc || district, cityDocs);
  } catch (e) {
    if (createdDistrictId) {
      await Promise.allSettled([
        City.deleteMany({ district: createdDistrictId }),
        District.deleteOne({ _id: createdDistrictId }),
      ]);
    }

    if (e?.code === 11000) {
      throw new ApiError(409, "District or city already exists", null);
    }
    if (e instanceof ApiError) throw e;
    throw e;
  }
};

/**
 * Get all districts with their cities.
 * @returns {Promise<object[]>} 
 */
const getDistricts = async () => {
  const districts = await District.find({}).sort({ name: 1 }).lean();
  if (districts.length === 0) {
    return [];
  }

  const districtIds = districts.map((district) => district._id);
  const cityDocs = await City.find({ district: { $in: districtIds } })
    .populate("district", "name key")
    .sort({ name: 1 })
    .lean();

  const citiesByDistrictId = new Map();
  for (const city of cityDocs) {
    const districtId = city?.district?._id || city?.district;
    const key = String(districtId);
    if (!citiesByDistrictId.has(key)) citiesByDistrictId.set(key, []);
    citiesByDistrictId.get(key).push(city);
  }

  return districts.map((district) => {
    const cities = citiesByDistrictId.get(String(district._id)) || [];
    return buildDistrictResponse(district, cities);
  });
};

/**
 * Update a district and propagate changes.
 * @param {object} params
 * @param {string} params.districtId
 * @param {object} params.body
 * @returns {Promise<object>} 
 */
const updateDistrict = async ({ districtId, body }) => {
  const district = await ensureDistrictExists(districtId);
  if (!district) {
    throw new ApiError(404, "District not found", null);
  }

  const nextName = String(body?.name || body?.district || "").trim();
  if (!nextName) {
    throw new ApiError(400, "district name is required", null);
  }

  const nextKey = normalizeKey(nextName);
  const oldName = String(district.name || "").trim();
  const oldKey = String(district.key || normalizeKey(oldName));

  if (nextKey !== oldKey) {
    const duplicate = await District.findOne({ key: nextKey, _id: { $ne: district._id } }).lean();
    if (duplicate) {
      throw new ApiError(409, `District ${nextName} already exists`, null);
    }
  }

  district.name = nextName;
  district.key = nextKey;
  await district.save();

  if (nextKey !== oldKey || nextName !== oldName) {
    await propagateDistrictRename({
      districtId: district._id,
      oldName,
      oldKey,
      newName: nextName,
      newKey: nextKey,
    });
  }

  const response = await getDistrictWithCities(district._id);
  return response || buildDistrictResponse(district.toObject(), []);
};

/**
 * Delete a district and cascading city/stop data.
 * @param {object} params
 * @param {string} params.districtId
 * @returns {Promise<object>} 
 */
const deleteDistrict = async ({ districtId }) => {
  if (!mongoose.isValidObjectId(districtId)) {
    throw new ApiError(400, "Invalid district id", null);
  }

  const district = await District.findById(districtId).lean();
  if (!district) {
    throw new ApiError(404, "District not found", null);
  }

  const cityDocs = await City.find({ district: districtId }).select("_id key name").lean();
  const cityIds = cityDocs.map((city) => city._id);
  const cityKeys = cityDocs.map((city) => city.key);

  if (cityIds.length > 0) {
    const linkedRoutes = await Route.countDocuments({
      $or: [{ sourceCity: { $in: cityIds } }, { destinationCity: { $in: cityIds } }],
    });
    if (linkedRoutes > 0) {
      throw new ApiError(
        409,
        "Cannot delete district because one or more cities are used as route source/destination",
        { linkedRoutes }
      );
    }
  }

  const stopFilter = {
    $or: [
      { districtKey: district.key },
      { district: district.name },
      ...(cityIds.length > 0 ? [{ cityRef: { $in: cityIds } }] : []),
      ...(cityKeys.length > 0 ? [{ cityKey: { $in: cityKeys } }] : []),
    ],
  };

  const affectedRouteIds = await Stop.distinct("route", stopFilter);
  const deletedStopsResult = await Stop.deleteMany(stopFilter);
  const deletedCitiesResult = await City.deleteMany({ district: districtId });
  await District.deleteOne({ _id: districtId });

  await syncRouteMidStopsForIds(affectedRouteIds);

  return {
    message: "District deleted",
    deletedCities: deletedCitiesResult?.deletedCount || 0,
    deletedStops: deletedStopsResult?.deletedCount || 0,
  };
};

/**
 * Add a city to a district.
 * @param {object} params
 * @param {string} params.districtId
 * @param {object} params.body
 * @returns {Promise<object>} 
 */
const addCityToDistrict = async ({ districtId, body }) => {
  const district = await ensureDistrictExists(districtId);
  if (!district) {
    throw new ApiError(404, "District not found", null);
  }

  const cityName = String(body?.name || body?.city || "").trim();
  if (!cityName) {
    throw new ApiError(400, "city name is required", null);
  }

  const cityKey = normalizeKey(cityName);
  const existingCity = await City.findOne({ key: cityKey }).populate("district", "name key").lean();
  if (existingCity) {
    throw new ApiError(409, resolveCityConflictMessage(existingCity), null);
  }

  const city = await City.create({
    name: cityName,
    key: cityKey,
    district: district._id,
  });

  const districtResponse = await getDistrictWithCities(district._id);
  const createdCity =
    districtResponse?.cityObjects?.find((item) => String(item._id) === String(city._id)) ||
    toCityResponse(await City.findById(city._id).populate("district", "name key").lean());

  return {
    city: createdCity,
    district: districtResponse,
  };
};

/**
 * Update a city within a district.
 * @param {object} params
 * @param {string} params.districtId
 * @param {string} params.cityId
 * @param {object} params.body
 * @returns {Promise<object>} 
 */
const updateCity = async ({ districtId, cityId, body }) => {
  let city = null;

  // First try to find by _id + district
  if (mongoose.isValidObjectId(districtId) && mongoose.isValidObjectId(cityId)) {
    city = await City.findOne({ _id: cityId, district: districtId }).populate("district", "name key");
  }

  // If _id lookup failed, try to find by city name (for fallback/recovery)
  if (!city && mongoose.isValidObjectId(districtId)) {
    const possibleCities = await City.find({ district: districtId }).populate("district", "name key");
    city = possibleCities.find(
      (c) => normalizeKey(c.name) === normalizeKey(cityId) || c._id.toString() === cityId
    );
  }

  if (!city) {
    throw new ApiError(404, "City not found in selected district", null);
  }

  const nextName = String(body?.name || body?.city || "").trim();
  if (!nextName) {
    throw new ApiError(400, "city name is required", null);
  }

  const oldKey = String(city.key || normalizeKey(city.name));
  const oldName = String(city.name || "").trim();
  const nextKey = normalizeKey(nextName);

  if (nextKey !== oldKey) {
    const duplicate = await City.findOne({ key: nextKey, _id: { $ne: city._id } })
      .populate("district", "name key")
      .lean();
    if (duplicate) {
      throw new ApiError(409, resolveCityConflictMessage(duplicate), null);
    }
  }

  city.name = nextName;
  city.key = nextKey;
  await city.save();

  await propagateCityRename({
    cityId: city._id,
    oldName,
    oldKey,
    newName: nextName,
    newKey: nextKey,
    districtName: String(city?.district?.name || "").trim(),
    districtKey: normalizeKey(city?.district?.key || city?.district?.name),
  });

  const districtResponse = await getDistrictWithCities(districtId);
  const updatedCity = districtResponse?.cityObjects?.find((item) => String(item._id) === String(city._id)) || null;

  return {
    city: updatedCity,
    district: districtResponse,
  };
};

/**
 * Delete a city from a district.
 * @param {object} params
 * @param {string} params.districtId
 * @param {string} params.cityId
 * @returns {Promise<object>} 
 */
const deleteCity = async ({ districtId, cityId }) => {
  let city = null;

  // First try to find by _id + district
  if (mongoose.isValidObjectId(districtId) && mongoose.isValidObjectId(cityId)) {
    city = await City.findOne({ _id: cityId, district: districtId }).populate("district", "name key").lean();
  }

  // If _id lookup failed, try to find by city name (for fallback/recovery)
  if (!city && mongoose.isValidObjectId(districtId)) {
    // Try to find city by its name as the cityId (for backwards compatibility/recovery)
    const possibleCities = await City.find({ district: districtId }).populate("district", "name key").lean();
    city = possibleCities.find(
      (c) => normalizeKey(c.name) === normalizeKey(cityId) || c._id.toString() === cityId
    );
  }

  if (!city) {
    throw new ApiError(404, "City not found in selected district", null);
  }

  const linkedRoutes = await Route.countDocuments({
    $or: [{ sourceCity: city._id }, { destinationCity: city._id }],
  });
  if (linkedRoutes > 0) {
    throw new ApiError(409, "Cannot delete city because it is used as route source/destination", {
      linkedRoutes,
    });
  }

  const stopFilter = {
    $or: [{ cityRef: city._id }, { cityKey: city.key }],
  };
  const affectedRouteIds = await Stop.distinct("route", stopFilter);
  const deletedStopsResult = await Stop.deleteMany(stopFilter);
  await City.deleteOne({ _id: city._id });

  await syncRouteMidStopsForIds(affectedRouteIds);

  const districtResponse = await getDistrictWithCities(districtId);

  return {
    message: "City deleted",
    deletedStops: deletedStopsResult?.deletedCount || 0,
    district: districtResponse,
  };
};

module.exports = {
  createDistrictWithCities,
  getDistricts,
  updateDistrict,
  deleteDistrict,
  addCityToDistrict,
  updateCity,
  deleteCity,
};
