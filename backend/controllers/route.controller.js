const mongoose = require("mongoose");

const Route = require("../models/Route");
const City = require("../models/City");
const Stop = require("../models/Stop");
const Schedule = require("../models/Schedule");
const Booking = require("../models/Booking");
const { normalizeRoutePointList, getRoutePointLanes } = require("../utils/routePoints");
const { syncRoutePoints } = require("../services/routePointSync.service");

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

exports.listRoutes = async (req, res) => {
	try {
		const routes = await Route.find({}).populate(populateRoute).sort({ source: 1, destination: 1 });
		return res.json(routes.map((route) => withRoutePointCompatibility(route)));
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};

exports.listPopularRoutes = async (req, res) => {
	try {
		const requestedLimit = Number(req.query?.limit);
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

		const popularRoutes = routes
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

		return res.json(popularRoutes);
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};

exports.createRoute = async (req, res) => {
	try {
		const sourceCityId = req.body?.sourceCityId || req.body?.sourceCity;
		const destinationCityId = req.body?.destinationCityId || req.body?.destinationCity;
		const distance = req.body?.distance !== undefined && req.body?.distance !== null && req.body?.distance !== "" ? Number(req.body.distance) : NaN;

		if (req.body?.sourceDistrict !== undefined || req.body?.destinationDistrict !== undefined) {
			return res.status(400).json({
				message: "sourceDistrict and destinationDistrict are derived automatically and must not be sent",
			});
		}

		if (!mongoose.isValidObjectId(sourceCityId) || !mongoose.isValidObjectId(destinationCityId)) {
			return res.status(400).json({ message: "sourceCity and destinationCity must be valid City ids" });
		}
		if (String(sourceCityId) === String(destinationCityId)) {
			return res.status(400).json({ message: "sourceCity and destinationCity cannot be the same" });
		}
		if (!Number.isFinite(distance) || distance <= 0) {
			return res.status(400).json({ message: "distance must be a positive number" });
		}

		const [sourceCity, destinationCity] = await Promise.all([
			City.findById(sourceCityId).populate("district"),
			City.findById(destinationCityId).populate("district"),
		]);

		if (!sourceCity || !destinationCity) {
			return res.status(400).json({ message: "sourceCity or destinationCity does not exist" });
		}
		if (!sourceCity.district || !destinationCity.district) {
			return res.status(400).json({ message: "Both cities must belong to valid districts" });
		}

		const normalizedBoarding = normalizeRoutePointList(req.body?.boardingPoints, { requireTime: true });
		if (!normalizedBoarding.ok) {
			return res.status(400).json({ message: `boardingPoints: ${normalizedBoarding.message}` });
		}

		const normalizedDropping = normalizeRoutePointList(req.body?.droppingPoints, { requireTime: true });
		if (!normalizedDropping.ok) {
			return res.status(400).json({ message: `droppingPoints: ${normalizedDropping.message}` });
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
		return res.status(201).json(withRoutePointCompatibility(created));
	} catch (e) {
		if (e?.code === 11000) {
			return res.status(409).json({ message: "Route already exists between selected cities" });
		}
		return res.status(500).json({ message: e.message });
	}
};

exports.syncRoutePointLanes = async (req, res) => {
	try {
		const routeId = req.params?.id;
		if (!mongoose.isValidObjectId(routeId)) {
			return res.status(400).json({ message: "Invalid route id" });
		}

		const updated = await syncRoutePoints(routeId);
		if (!updated) {
			return res.status(404).json({ message: "Route not found" });
		}

		return res.json(withRoutePointCompatibility(updated));
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};
