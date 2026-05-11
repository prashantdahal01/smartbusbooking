const mongoose = require("mongoose");
const { ApiError } = require("../../utils/apiError");
const { normalizeRoutePointList, getRoutePointLanes } = require("../../utils/routePoints");
const { syncRoutePoints } = require("../../services/routePointSync.service");
const { Route, City, Stop, Schedule, Booking } = require("./route.model");

const populateRoute = {
  path: "sourceCity destinationCity",
  populate: { path: "district", select: "name key" },
};

const normalizeKey = (value) => String(value || "").trim().toLowerCase();

const withRoutePointCompatibility = (routeDoc) => {
  if (!routeDoc) return routeDoc;
  const route = routeDoc?.toObject ? routeDoc.toObject() : { ...routeDoc };
  const { boardingPoints, droppingPoints } = getRoutePointLanes(route);
  route.boardingPoints = boardingPoints;
  route.droppingPoints = droppingPoints;
  return route;
};

/**
 * List all routes with compatibility fields.
 * @returns {Promise<object[]>} 
 */
const listRoutes = async () => {
  const routes = await Route.find({}).populate(populateRoute).sort({ source: 1, destination: 1 });
  return routes.map((route) => withRoutePointCompatibility(route));
};

/**
 * List popular routes by bookings/schedules.
 * @param {object} params
 * @param {object} params.query
 * @returns {Promise<object[]>} 
 */
const listPopularRoutes = async ({ query }) => {
  const requestedLimit = Number(query?.limit);
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(Math.trunc(requestedLimit), 20)
    : 6;

  const [routes, scheduleStats, bookingStats] = await Promise.all([
    Route.find({}).select("source destination distance createdAt").lean(),
    Schedule.aggregate([
      { $match: { route: { $ne: null } } },
      {
        $group: {
          _id: "$route",
          scheduleCount: { $sum: 1 },
          avgDurationMinutes: {
            $avg: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$durationMinutes", null] },
                    { $gt: ["$durationMinutes", 0] },
                  ],
                },
                "$durationMinutes",
                null,
              ],
            },
          },
        },
      },
    ]),
    Booking.aggregate([
      { $match: { status: "confirmed" } },
      {
        $lookup: {
          from: "schedules",
          localField: "schedule",
          foreignField: "_id",
          as: "scheduleDoc",
        },
      },
      { $unwind: "$scheduleDoc" },
      { $match: { "scheduleDoc.route": { $ne: null } } },
      {
        $addFields: {
          seatCountPerBooking: { $size: { $ifNull: ["$seats", []] } },
          pricePerSeat: {
            $cond: [
              { $gt: [{ $size: { $ifNull: ["$seats", []] } }, 0] },
              { $divide: ["$totalPrice", { $size: { $ifNull: ["$seats", []] } }] },
              null,
            ],
          },
        },
      },
      {
        $group: {
          _id: "$scheduleDoc.route",
          bookingCount: { $sum: 1 },
          passengerCount: { $sum: "$seatCountPerBooking" },
          minSeatPrice: { $min: "$pricePerSeat" },
        },
      },
    ]),
  ]);

  const scheduleStatByRouteId = new Map(
    scheduleStats
      .filter((item) => item?._id)
      .map((item) => [String(item._id), item])
  );

  const bookingStatByRouteId = new Map(
    bookingStats
      .filter((item) => item?._id)
      .map((item) => [String(item._id), item])
  );

  return routes
    .map((route) => {
      const routeId = String(route._id);
      const scheduleStat = scheduleStatByRouteId.get(routeId) || {};
      const bookingStat = bookingStatByRouteId.get(routeId) || {};

      const scheduleCount = Number(scheduleStat.scheduleCount) || 0;
      const bookingCount = Number(bookingStat.bookingCount) || 0;
      const passengerCount = Number(bookingStat.passengerCount) || 0;
      const avgDurationMinutes = Number(scheduleStat.avgDurationMinutes);
      const minSeatPrice = Number(bookingStat.minSeatPrice);

      const popularityScore =
        (bookingCount * 10000)
        + (passengerCount * 100)
        + scheduleCount;

      return {
        routeId,
        source: String(route.source || "").trim(),
        destination: String(route.destination || "").trim(),
        distance: Number(route.distance) || null,
        scheduleCount,
        bookingCount,
        passengerCount,
        avgDurationMinutes: Number.isFinite(avgDurationMinutes) && avgDurationMinutes > 0
          ? Math.round(avgDurationMinutes)
          : null,
        minSeatPrice: Number.isFinite(minSeatPrice) && minSeatPrice > 0
          ? Math.round(minSeatPrice)
          : null,
        popularityScore,
        createdAt: route.createdAt,
      };
    })
    .filter((route) => route.source && route.destination)
    .sort((a, b) => {
      if (b.popularityScore !== a.popularityScore) return b.popularityScore - a.popularityScore;
      const aCreatedAt = new Date(a.createdAt || 0).getTime();
      const bCreatedAt = new Date(b.createdAt || 0).getTime();
      if (bCreatedAt !== aCreatedAt) return bCreatedAt - aCreatedAt;
      const bySource = a.source.localeCompare(b.source, undefined, { sensitivity: "base" });
      if (bySource !== 0) return bySource;
      return a.destination.localeCompare(b.destination, undefined, { sensitivity: "base" });
    })
    .slice(0, limit)
    .map(({ popularityScore, createdAt, ...route }) => route);
};

/**
 * Create a new route.
 * @param {object} params
 * @param {object} params.body
 * @returns {Promise<object>} 
 */
const createRoute = async ({ body }) => {
  try {
    const sourceCityId = body?.sourceCityId || body?.sourceCity;
    const destinationCityId = body?.destinationCityId || body?.destinationCity;
    const distance = body?.distance !== undefined && body?.distance !== null && body?.distance !== ""
      ? Number(body.distance)
      : NaN;

    if (body?.sourceDistrict !== undefined || body?.destinationDistrict !== undefined) {
      throw new ApiError(400, "sourceDistrict and destinationDistrict are derived automatically and must not be sent", null);
    }

    if (!mongoose.isValidObjectId(sourceCityId) || !mongoose.isValidObjectId(destinationCityId)) {
      throw new ApiError(400, "sourceCity and destinationCity must be valid City ids", null);
    }
    if (String(sourceCityId) === String(destinationCityId)) {
      throw new ApiError(400, "sourceCity and destinationCity cannot be the same", null);
    }
    if (!Number.isFinite(distance) || distance <= 0) {
      throw new ApiError(400, "distance must be a positive number", null);
    }

    const [sourceCity, destinationCity] = await Promise.all([
      City.findById(sourceCityId).populate("district"),
      City.findById(destinationCityId).populate("district"),
    ]);

    if (!sourceCity || !destinationCity) {
      throw new ApiError(400, "sourceCity or destinationCity does not exist", null);
    }
    if (!sourceCity.district || !destinationCity.district) {
      throw new ApiError(400, "Both cities must belong to valid districts", null);
    }

    const normalizedBoarding = normalizeRoutePointList(body?.boardingPoints, { requireTime: true });
    if (!normalizedBoarding.ok) {
      throw new ApiError(400, `boardingPoints: ${normalizedBoarding.message}`, null);
    }

    const normalizedDropping = normalizeRoutePointList(body?.droppingPoints, { requireTime: true });
    if (!normalizedDropping.ok) {
      throw new ApiError(400, `droppingPoints: ${normalizedDropping.message}`, null);
    }

    const boardingPoints = Array.isArray(normalizedBoarding.value) && normalizedBoarding.value.length > 0
      ? normalizedBoarding.value
      : [{ name: sourceCity.name, time: "00:00", order: 1 }];

    const droppingPoints = Array.isArray(normalizedDropping.value) && normalizedDropping.value.length > 0
      ? normalizedDropping.value
      : [{ name: destinationCity.name, time: "00:00", order: 1 }];

    const route = await Route.create({
      sourceCity: sourceCity._id,
      destinationCity: destinationCity._id,
      sourceDistrict: sourceCity.district.name,
      destinationDistrict: destinationCity.district.name,
      source: sourceCity.name,
      destination: destinationCity.name,
      distance,
      boardingPoints,
      droppingPoints,
      stops: [],
    });

    const destinationCityName = String(destinationCity.name || "").trim();
    await Stop.findOneAndUpdate(
      { route: route._id, cityKey: normalizeKey(destinationCityName) },
      {
        $set: {
          route: route._id,
          city: destinationCity._id,
          cityRef: destinationCity._id,
          cityName: destinationCityName,
          cityKey: normalizeKey(destinationCityName),
          district: destinationCity.district.name,
          districtKey: normalizeKey(destinationCity.district.key || destinationCity.district.name),
          type: "drop",
          order: 9999,
          offsetMinutes: null,
          absoluteTime: "",
        },
      },
      { new: true, upsert: true }
    );

    const created = await Route.findById(route._id).populate(populateRoute);
    return withRoutePointCompatibility(created);
  } catch (e) {
    if (e?.code === 11000) {
      throw new ApiError(409, "Route already exists between selected cities", null);
    }
    if (e instanceof ApiError) throw e;
    throw e;
  }
};

/**
 * Synchronize route point lanes from stops.
 * @param {object} params
 * @param {string} params.routeId
 * @returns {Promise<object>} 
 */
const syncRoutePointLanes = async ({ routeId }) => {
  if (!mongoose.isValidObjectId(routeId)) {
    throw new ApiError(400, "Invalid route id", null);
  }

  const updated = await syncRoutePoints(routeId);
  if (!updated) {
    throw new ApiError(404, "Route not found", null);
  }

  return withRoutePointCompatibility(updated);
};

module.exports = {
  listRoutes,
  listPopularRoutes,
  createRoute,
  syncRoutePointLanes,
};
