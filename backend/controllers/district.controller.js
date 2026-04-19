const mongoose = require("mongoose");
const District = require("../models/District");
const City = require("../models/City");
const Route = require("../models/Route");
const Stop = require("../models/Stop");
const { syncRoutePoints, syncRoutePointsForIds } = require("../services/routePointSync.service");

const normalizeKey = (value) => String(value || "").trim().toLowerCase();
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

const getRouteStopsOrdered = async (routeId) => Stop.find({ route: routeId }).sort({ order: 1, createdAt: 1, _id: 1 }).lean();

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

exports.createDistrictWithCities = async (req, res) => {
	let createdDistrictId = null;
	try {
		const districtName = String(req.body?.district || req.body?.name || "").trim();
		const districtKey = normalizeKey(districtName);
		const { cities: normalizedCities, duplicates: duplicateCities } = normalizeCityNames(req.body?.cities);

		if (!districtName) {
			return res.status(400).json({ message: "district is required" });
		}
		if (normalizedCities === null) {
			return res.status(400).json({ message: "cities must be an array" });
		}
		if (duplicateCities.length > 0) {
			return res.status(400).json({ message: `Duplicate cities in request: ${duplicateCities.join(", ")}` });
		}
		if (normalizedCities.length === 0) {
			return res.status(400).json({ message: "at least one city is required" });
		}

		const existingDistrict = await District.findOne({ key: districtKey }).lean();
		if (existingDistrict) {
			return res.status(409).json({ message: `District ${districtName} already exists` });
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
			return res.status(409).json({ message: `City already exists: ${collisions}` });
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
		return res.status(201).json(buildDistrictResponse(districtDoc || district, cityDocs));
	} catch (e) {
		if (createdDistrictId) {
			await Promise.allSettled([
				City.deleteMany({ district: createdDistrictId }),
				District.deleteOne({ _id: createdDistrictId }),
			]);
		}

		if (e?.code === 11000) {
			return res.status(409).json({ message: "District or city already exists" });
		}
		return res.status(500).json({ message: e.message });
	}
};

exports.getDistricts = async (req, res) => {
	try {
		const districts = await District.find({}).sort({ name: 1 }).lean();
		if (districts.length === 0) {
			return res.json([]);
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

		const response = districts.map((district) => {
			const cities = citiesByDistrictId.get(String(district._id)) || [];
			return buildDistrictResponse(district, cities);
		});

		return res.json(response);
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};

exports.updateDistrict = async (req, res) => {
	try {
		const districtId = req.params.id;
		const district = await ensureDistrictExists(districtId);
		if (!district) {
			return res.status(404).json({ message: "District not found" });
		}

		const nextName = String(req.body?.name || req.body?.district || "").trim();
		if (!nextName) {
			return res.status(400).json({ message: "district name is required" });
		}

		const nextKey = normalizeKey(nextName);
		const oldName = String(district.name || "").trim();
		const oldKey = String(district.key || normalizeKey(oldName));

		if (nextKey !== oldKey) {
			const duplicate = await District.findOne({ key: nextKey, _id: { $ne: district._id } }).lean();
			if (duplicate) {
				return res.status(409).json({ message: `District ${nextName} already exists` });
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
		return res.json(response || buildDistrictResponse(district.toObject(), []));
	} catch (e) {
		if (e?.code === 11000) {
			return res.status(409).json({ message: "District already exists" });
		}
		return res.status(500).json({ message: e.message });
	}
};

exports.deleteDistrict = async (req, res) => {
	try {
		const districtId = req.params.id;
		if (!mongoose.isValidObjectId(districtId)) {
			return res.status(400).json({ message: "Invalid district id" });
		}

		const district = await District.findById(districtId).lean();
		if (!district) {
			return res.status(404).json({ message: "District not found" });
		}

		const cityDocs = await City.find({ district: districtId }).select("_id key name").lean();
		const cityIds = cityDocs.map((city) => city._id);
		const cityKeys = cityDocs.map((city) => city.key);

		if (cityIds.length > 0) {
			const linkedRoutes = await Route.countDocuments({
				$or: [{ sourceCity: { $in: cityIds } }, { destinationCity: { $in: cityIds } }],
			});
			if (linkedRoutes > 0) {
				return res.status(409).json({
					message: "Cannot delete district because one or more cities are used as route source/destination",
					linkedRoutes,
				});
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

		return res.json({
			message: "District deleted",
			deletedCities: deletedCitiesResult?.deletedCount || 0,
			deletedStops: deletedStopsResult?.deletedCount || 0,
		});
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};

exports.addCityToDistrict = async (req, res) => {
	try {
		const districtId = req.params.id;
		const district = await ensureDistrictExists(districtId);
		if (!district) {
			return res.status(404).json({ message: "District not found" });
		}

		const cityName = String(req.body?.name || req.body?.city || "").trim();
		if (!cityName) {
			return res.status(400).json({ message: "city name is required" });
		}

		const cityKey = normalizeKey(cityName);
		const existingCity = await City.findOne({ key: cityKey }).populate("district", "name key").lean();
		if (existingCity) {
			return res.status(409).json({ message: resolveCityConflictMessage(existingCity) });
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

		return res.status(201).json({
			city: createdCity,
			district: districtResponse,
		});
	} catch (e) {
		if (e?.code === 11000) {
			return res.status(409).json({ message: "City already exists" });
		}
		return res.status(500).json({ message: e.message });
	}
};

exports.updateCity = async (req, res) => {
	try {
		const districtId = req.params.districtId;
		const cityId = req.params.cityId;

		if (!mongoose.isValidObjectId(districtId) || !mongoose.isValidObjectId(cityId)) {
			return res.status(400).json({ message: "Invalid district or city id" });
		}

		const city = await City.findOne({ _id: cityId, district: districtId }).populate("district", "name key");
		if (!city) {
			return res.status(404).json({ message: "City not found in selected district" });
		}

		const nextName = String(req.body?.name || req.body?.city || "").trim();
		if (!nextName) {
			return res.status(400).json({ message: "city name is required" });
		}

		const oldKey = String(city.key || normalizeKey(city.name));
		const oldName = String(city.name || "").trim();
		const nextKey = normalizeKey(nextName);

		if (nextKey !== oldKey) {
			const duplicate = await City.findOne({ key: nextKey, _id: { $ne: city._id } })
				.populate("district", "name key")
				.lean();
			if (duplicate) {
				return res.status(409).json({ message: resolveCityConflictMessage(duplicate) });
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

		return res.json({
			city: updatedCity,
			district: districtResponse,
		});
	} catch (e) {
		if (e?.code === 11000) {
			return res.status(409).json({ message: "City already exists" });
		}
		return res.status(500).json({ message: e.message });
	}
};

exports.deleteCity = async (req, res) => {
	try {
		const districtId = req.params.districtId;
		const cityId = req.params.cityId;

		if (!mongoose.isValidObjectId(districtId) || !mongoose.isValidObjectId(cityId)) {
			return res.status(400).json({ message: "Invalid district or city id" });
		}

		const city = await City.findOne({ _id: cityId, district: districtId }).populate("district", "name key").lean();
		if (!city) {
			return res.status(404).json({ message: "City not found in selected district" });
		}

		const linkedRoutes = await Route.countDocuments({
			$or: [{ sourceCity: city._id }, { destinationCity: city._id }],
		});
		if (linkedRoutes > 0) {
			return res.status(409).json({
				message: "Cannot delete city because it is used as route source/destination",
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

		return res.json({
			message: "City deleted",
			deletedStops: deletedStopsResult?.deletedCount || 0,
			district: districtResponse,
		});
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};
