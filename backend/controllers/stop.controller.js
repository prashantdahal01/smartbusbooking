const mongoose = require("mongoose");

const Route = require("../models/Route");
const Stop = require("../models/Stop");

const {
	normalizeKey,
	getDistrictIndexCached,
	resolveDistrictNameForPlace,
} = require("../services/districtData.service");
const { shortestDistrictPath } = require("../utils/districtRoutePlanner");

const toStopName = (raw) => {
	if (raw === null || raw === undefined) return "";
	if (typeof raw === "string") return raw;
	if (typeof raw === "object") return raw.name;
	return "";
};

const uniqueInOrder = (items) => {
	const out = [];
	const seen = new Set();
	(items || []).forEach((x) => {
		const v = String(x || "").trim();
		const k = normalizeKey(v);
		if (!k || seen.has(k)) return;
		seen.add(k);
		out.push(v);
	});
	return out;
};

const parseOffsetMinutes = (v) => {
	if (v === undefined) return { provided: false };
	if (v === null || v === "") return { provided: true, value: null };
	const n = Number(v);
	if (!Number.isFinite(n)) return { provided: true, value: NaN };
	return { provided: true, value: Math.round(n) };
};

const isValidTimeHHmm = (s) => /^\d{2}:\d{2}$/.test(String(s || "").trim());

const computeOrder = ({ route, districtName, cityName, districtDoc }) => {
	const districtsCovered = Array.isArray(route?.districtsCovered) ? route.districtsCovered : [];
	const districtKey = normalizeKey(districtName);
	const cityKey = normalizeKey(cityName);

	const dIdx = districtsCovered.map((d) => normalizeKey(d)).indexOf(districtKey);
	const cities = Array.isArray(districtDoc?.cities) ? districtDoc.cities : [];
	const cIdx = cities.map((c) => normalizeKey(c)).indexOf(cityKey);

	const di = dIdx >= 0 ? dIdx : 999;
	const ci = cIdx >= 0 ? cIdx : 999;
	return di * 1000 + ci;
};

const syncRouteStopsFromStopDocs = async (route) => {
	if (!route) return;
	const stops = await Stop.find({ route: route._id }).sort({ order: 1, districtKey: 1, cityKey: 1 }).lean();

	const srcKey = normalizeKey(route.source);
	const dstKey = normalizeKey(route.destination);
	const seen = new Set();
	const mids = [];

	stops.forEach((s) => {
		const name = String(s?.city || "").trim();
		const k = normalizeKey(name);
		if (!k) return;
		if (k === srcKey || k === dstKey) return;
		if (seen.has(k)) return;
		seen.add(k);
		mids.push({ name });
	});

	route.stops = mids;
	await route.save();
};

exports.getStopsByRoute = async (req, res) => {
	try {
		const routeId = req.params.id || req.query.routeId;
		if (!mongoose.isValidObjectId(routeId)) {
			return res.status(400).json({ message: "Invalid route id" });
		}

		const stops = await Stop.find({ route: routeId }).sort({ order: 1, districtKey: 1, cityKey: 1 }).lean();
		return res.json(stops);
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};

exports.autoGenerateStops = async (req, res) => {
	try {
		const { routeId, overwrite } = req.body || {};
		if (!mongoose.isValidObjectId(routeId)) {
			return res.status(400).json({ message: "routeId is required" });
		}

		const route = await Route.findById(routeId);
		if (!route) return res.status(404).json({ message: "Route not found" });

		const existingCount = await Stop.countDocuments({ route: routeId });
		if (existingCount > 0 && !overwrite) {
			const stops = await Stop.find({ route: routeId }).sort({ order: 1, districtKey: 1, cityKey: 1 }).lean();
			return res.json({ route, stops, message: "Stops already exist (set overwrite=true to regenerate)" });
		}

		const fromDistrict = await resolveDistrictNameForPlace(route.source);
		const toDistrict = await resolveDistrictNameForPlace(route.destination);
		if (!fromDistrict || !toDistrict) {
			return res.status(400).json({
				message:
					"Unable to infer source/destination districts from route. Ensure district data is seeded and that route source/destination match a known city or district.",
			});
		}

		const { districtsByKey } = await getDistrictIndexCached();

		let districtsCovered = Array.isArray(route.districtsCovered) && route.districtsCovered.length > 0 ? route.districtsCovered : [];
		if (districtsCovered.length === 0) {
			const pathKeys = shortestDistrictPath({ fromDistrict, toDistrict });
			if (Array.isArray(pathKeys) && pathKeys.length > 0) {
				districtsCovered = pathKeys
					.map((k) => districtsByKey.get(normalizeKey(k))?.name || String(k))
					.map((s) => String(s || "").trim())
					.filter(Boolean);
			} else {
				districtsCovered = uniqueInOrder([fromDistrict, toDistrict]);
			}
		}

		route.districtsCovered = uniqueInOrder(districtsCovered);
		await route.save();

		if (overwrite) {
			await Stop.deleteMany({ route: routeId });
		}

		const dc = route.districtsCovered;
		const lastIdx = dc.length - 1;
		const midIdx = Math.floor(lastIdx / 2);

		const toCreate = [];

		dc.forEach((districtName, idx) => {
			const districtDoc = districtsByKey.get(normalizeKey(districtName));
			const cities = Array.isArray(districtDoc?.cities) ? districtDoc.cities.map((c) => String(c || "").trim()).filter(Boolean) : [];
			if (cities.length === 0) return;

			const pickFirst = (n) => cities.slice(0, Math.max(0, n));
			const pickLast = (n) => (n <= 0 ? [] : cities.slice(Math.max(0, cities.length - n)));

			let pickupCities = [];
			let dropCities = [];

			if (dc.length === 1) {
				pickupCities = pickFirst(2);
				dropCities = pickLast(2);
			} else if (idx === 0) {
				pickupCities = pickFirst(2);
			} else if (idx === lastIdx) {
				pickupCities = pickFirst(1);
				dropCities = pickLast(2);
			} else if (idx <= midIdx) {
				pickupCities = pickFirst(1);
			} else {
				dropCities = pickLast(1);
			}

			pickupCities.forEach((city) => {
				const cityName = String(city || "").trim();
				if (!cityName) return;
				const order = computeOrder({ route, districtName, cityName, districtDoc });
				toCreate.push({
					route: route._id,
					district: districtName,
					districtKey: normalizeKey(districtName),
					city: cityName,
					cityKey: normalizeKey(cityName),
					type: "pickup",
					offsetMinutes: null,
					absoluteTime: "",
					order,
				});
			});

			dropCities.forEach((city) => {
				const cityName = String(city || "").trim();
				if (!cityName) return;
				const order = computeOrder({ route, districtName, cityName, districtDoc });
				toCreate.push({
					route: route._id,
					district: districtName,
					districtKey: normalizeKey(districtName),
					city: cityName,
					cityKey: normalizeKey(cityName),
					type: "drop",
					offsetMinutes: null,
					absoluteTime: "",
					order,
				});
			});
		});

		// De-dup within this generation batch
		const uniqueKey = (s) => `${String(s.route)}|${s.districtKey}|${s.cityKey}`;
		const seen = new Set();
		const uniqueDocs = [];
		toCreate.forEach((d) => {
			const k = uniqueKey(d);
			if (seen.has(k)) return;
			seen.add(k);
			uniqueDocs.push(d);
		});

		if (uniqueDocs.length > 0) {
			try {
				await Stop.insertMany(uniqueDocs, { ordered: false });
			} catch (e) {
				// Ignore duplicate errors for idempotency
				if (!(e && (e.code === 11000 || e.writeErrors?.some((we) => we.code === 11000)))) throw e;
			}
		}

		const stops = await Stop.find({ route: routeId }).sort({ order: 1, districtKey: 1, cityKey: 1 }).lean();
		await syncRouteStopsFromStopDocs(route);

		return res.json({ route, stops });
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};

exports.createStop = async (req, res) => {
	try {
		const body = req.body || {};
		const routeId = body.routeId || body.route;
		const district = String(body.district || "").trim();
		const city = String(body.city || "").trim();
		const type = String(body.type || "").trim().toLowerCase();
		const offsetParsed = parseOffsetMinutes(body.offsetMinutes !== undefined ? body.offsetMinutes : body.offset);
		const absoluteTime = String(body.absoluteTime !== undefined ? body.absoluteTime : body.time || "").trim();

		if (!mongoose.isValidObjectId(routeId)) return res.status(400).json({ message: "routeId is required" });
		if (!district || !city) return res.status(400).json({ message: "district and city are required" });
		if (!['pickup','drop','both'].includes(type)) return res.status(400).json({ message: "type must be pickup, drop, or both" });
		if (offsetParsed.provided) {
			if (Number.isNaN(offsetParsed.value)) return res.status(400).json({ message: "offsetMinutes must be a number" });
			if (offsetParsed.value !== null && offsetParsed.value < 0) {
				return res.status(400).json({ message: "offsetMinutes must be >= 0" });
			}
		}
		if (absoluteTime && !isValidTimeHHmm(absoluteTime)) {
			return res.status(400).json({ message: "absoluteTime must be in HH:mm format" });
		}

		const route = await Route.findById(routeId);
		if (!route) return res.status(404).json({ message: "Route not found" });

		const { districtsByKey } = await getDistrictIndexCached();
		const districtDoc = districtsByKey.get(normalizeKey(district));

		let order = Number(body.order);
		if (!Number.isFinite(order)) {
			order = computeOrder({ route, districtName: district, cityName: city, districtDoc });
		}

		const districtKey = normalizeKey(district);
		const cityKey = normalizeKey(city);

		const stop = await Stop.findOneAndUpdate(
			{ route: routeId, districtKey, cityKey },
			{
				$set: {
					route: routeId,
					district,
					districtKey,
					city,
					cityKey,
					type,
					...(offsetParsed.provided ? { offsetMinutes: offsetParsed.value } : {}),
					...(body.absoluteTime !== undefined || body.time !== undefined ? { absoluteTime: absoluteTime || "" } : {}),
					order,
				},
			},
			{ new: true, upsert: true }
		);

		await syncRouteStopsFromStopDocs(route);
		return res.status(201).json(stop);
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};

exports.updateStop = async (req, res) => {
	try {
		const id = req.params.id;
		if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid stop id" });

		const updates = {};
		if (req.body?.type !== undefined) {
			const t = String(req.body.type || "").trim().toLowerCase();
			if (!['pickup','drop','both'].includes(t)) return res.status(400).json({ message: "type must be pickup, drop, or both" });
			updates.type = t;
		}
		if (req.body?.offsetMinutes !== undefined || req.body?.offset !== undefined) {
			const parsed = parseOffsetMinutes(req.body?.offsetMinutes !== undefined ? req.body.offsetMinutes : req.body.offset);
			if (Number.isNaN(parsed.value)) return res.status(400).json({ message: "offsetMinutes must be a number" });
			if (parsed.value !== null && parsed.value < 0) return res.status(400).json({ message: "offsetMinutes must be >= 0" });
			updates.offsetMinutes = parsed.value;
		}
		if (req.body?.absoluteTime !== undefined || req.body?.time !== undefined) {
			const t = String(req.body?.absoluteTime !== undefined ? req.body.absoluteTime : req.body.time || "").trim();
			if (t && !isValidTimeHHmm(t)) return res.status(400).json({ message: "absoluteTime must be in HH:mm format" });
			updates.absoluteTime = t;
		}
		if (req.body?.order !== undefined) {
			const n = Number(req.body.order);
			if (!Number.isFinite(n)) return res.status(400).json({ message: "order must be a number" });
			updates.order = n;
		}

		const stop = await Stop.findByIdAndUpdate(id, updates, { new: true });
		if (!stop) return res.status(404).json({ message: "Stop not found" });

		if (updates.order !== undefined) {
			const route = await Route.findById(stop.route);
			await syncRouteStopsFromStopDocs(route);
		}

		return res.json(stop);
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};

exports.deleteStop = async (req, res) => {
	try {
		const id = req.params.id;
		if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid stop id" });

		const stop = await Stop.findByIdAndDelete(id);
		if (!stop) return res.status(404).json({ message: "Stop not found" });

		const route = await Route.findById(stop.route);
		await syncRouteStopsFromStopDocs(route);

		return res.json({ message: "Deleted" });
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};
