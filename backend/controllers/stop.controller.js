const mongoose = require("mongoose");

const City = require("../models/City");
const Route = require("../models/Route");
const Stop = require("../models/Stop");
const { syncRoutePoints } = require("../services/routePointSync.service");

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

const toStopKmFromSource = (raw) => {
	if (!raw || typeof raw !== "object") return undefined;
	if (raw.kmFromSource !== undefined) return raw.kmFromSource;
	if (raw.distanceFromSourceKm !== undefined) return raw.distanceFromSourceKm;
	if (raw.km !== undefined) return raw.km;
	return undefined;
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

exports.getStopsByRoute = async (req, res) => {
	try {
		const routeId = req.params.id || req.query.routeId;
		if (!mongoose.isValidObjectId(routeId)) {
			return res.status(400).json({ message: "Invalid route id" });
		}

		const stops = await getRouteStopsOrdered(routeId);
		return res.json(stops);
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};

exports.autoGenerateStops = async (req, res) => {
	return res.status(400).json({
		message: "Bulk auto-generation is disabled. Destination drop stop is created automatically with route creation.",
	});
};

exports.createStop = async (req, res) => {
	try {
		const body = req.body || {};
		const routeId = body.route || body.routeId;
		if (!mongoose.isValidObjectId(routeId)) {
			return res.status(400).json({ message: "routeId is required" });
		}

		const route = await Route.findById(routeId);
		if (!route) return res.status(404).json({ message: "Route not found" });

		const inputStops = parseStopInputs(body);
		if (!Array.isArray(inputStops) || inputStops.length === 0) {
			return res.status(400).json({ message: "At least one stop is required" });
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
				return res.status(400).json({ message: `City not found or missing district: ${cityInput}` });
			}

			const typeRaw = String(rawStop?.type ?? body.type ?? "pickup").trim().toLowerCase();
			if (!["pickup", "drop", "both"].includes(typeRaw)) {
				return res.status(400).json({ message: "Manual stop type must be pickup, drop, or both" });
			}
			const type = typeRaw;

			const cityName = String(cityDoc.name || "").trim();
			const cityKey = normalizeKey(cityDoc.key || cityDoc.name);
			const districtName = String(cityDoc.district?.name || "").trim();
			const districtKey = normalizeKey(cityDoc.district?.key || cityDoc.district?.name);

			if (!districtName) {
				return res.status(400).json({ message: `City has no valid district: ${cityName}` });
			}

			if (incomingCityKeys.has(cityKey)) {
				return res.status(409).json({ message: `Duplicate city in request: ${cityName}` });
			}
			if (existingCityByKey.has(cityKey)) {
				const conflictCity = existingCityByKey.get(cityKey);
				return res.status(409).json({
					message: "Duplicate stop city for this route",
					cities: [String(conflictCity?.cityName || cityName).trim()],
				});
			}
			incomingCityKeys.add(cityKey);

			const offset = parseOffsetMinutes(
				rawStop?.offsetMinutes !== undefined ? rawStop.offsetMinutes : body.offsetMinutes
			);
			if (Number.isNaN(offset.value)) {
				return res.status(400).json({ message: `offsetMinutes must be a non-negative number for ${cityName}` });
			}

			const absoluteTime = String(
				rawStop?.absoluteTime !== undefined ? rawStop.absoluteTime : body.absoluteTime || ""
			).trim();
			if (absoluteTime && !isValidTimeHHmm(absoluteTime)) {
				return res.status(400).json({ message: `absoluteTime must be HH:mm for ${cityName}` });
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
				return res.status(400).json({ message: `order must be an integer between 1 and 9998 for ${cityName}` });
			}
			const incomingConflict = incomingOrderClaims.find(
				(claim) => claim.order === order && sharesOrderLane(claim.type, type)
			);
			if (incomingConflict) {
				return res.status(409).json({
					message: `Order ${order} is already used in ${describeStopLane(type)} sequence by ${incomingConflict.cityName || "another stop"}`,
				});
			}

			const existingConflict = existingOrderClaims.find(
				(claim) => claim.order === order && sharesOrderLane(claim.type, type)
			);
			if (existingConflict) {
				return res.status(409).json({
					message: `Order ${order} is already used in ${describeStopLane(type)} sequence by ${existingConflict.cityName || "another stop"}`,
				});
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
			return res.status(201).json(createdStops[0]);
		}
		return res.status(201).json(createdStops);
	} catch (e) {
		if (e?.code === 11000) {
			return res.status(409).json({ message: "Duplicate stop city for this route" });
		}
		return res.status(500).json({ message: e.message });
	}
};

exports.updateStop = async (req, res) => {
	try {
		const stopId = req.params.id;
		if (!mongoose.isValidObjectId(stopId)) {
			return res.status(400).json({ message: "Invalid stop id" });
		}

		const stop = await Stop.findById(stopId);
		if (!stop) return res.status(404).json({ message: "Stop not found" });

		let nextType = normalizeStopType(stop.type);

		if (req.body?.type !== undefined) {
			const typeRaw = String(req.body.type || "").trim().toLowerCase();
			if (!["pickup", "drop", "both"].includes(typeRaw)) {
				return res.status(400).json({ message: "type must be pickup, drop, or both" });
			}
			nextType = typeRaw;
		}

		let nextOrder = Number(stop.order);

		if (req.body?.order !== undefined) {
			const order = Math.trunc(Number(req.body.order));
			if (!Number.isFinite(order) || order <= 0 || order >= 9999) {
				return res.status(400).json({ message: "order must be an integer between 1 and 9998" });
			}
			nextOrder = order;
		}

		if (req.body?.order !== undefined || req.body?.type !== undefined) {
			const conflicts = await Stop.find({
				route: stop.route,
				order: nextOrder,
				_id: { $ne: stop._id },
			})
				.select("_id cityName order type")
				.lean();

			const conflict = conflicts.find((row) => sharesOrderLane(row?.type, nextType));

			if (conflict) {
				return res.status(409).json({
					message: `Order ${nextOrder} is already used in ${describeStopLane(nextType)} sequence by ${conflict.cityName || "another stop"}`,
				});
			}
		}

		if (req.body?.type !== undefined) {
			stop.type = nextType;
		}

		if (req.body?.order !== undefined) {
			stop.order = nextOrder;
		}

		if (req.body?.offsetMinutes !== undefined) {
			const offset = parseOffsetMinutes(req.body.offsetMinutes);
			if (Number.isNaN(offset.value)) {
				return res.status(400).json({ message: "offsetMinutes must be non-negative" });
			}
			stop.offsetMinutes = offset.value;
		}

		if (req.body?.absoluteTime !== undefined) {
			const absoluteTime = String(req.body.absoluteTime || "").trim();
			if (absoluteTime && !isValidTimeHHmm(absoluteTime)) {
				return res.status(400).json({ message: "absoluteTime must be HH:mm" });
			}
			stop.absoluteTime = absoluteTime;
		}

		await stop.save();

		const route = await Route.findById(stop.route);
		await syncRouteMidStops(route);

		return res.json(stop);
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};

exports.deleteStop = async (req, res) => {
	try {
		const stopId = req.params.id;
		if (!mongoose.isValidObjectId(stopId)) {
			return res.status(400).json({ message: "Invalid stop id" });
		}

		const stop = await Stop.findByIdAndDelete(stopId);
		if (!stop) return res.status(404).json({ message: "Stop not found" });

		const route = await Route.findById(stop.route);
		await syncRouteMidStops(route);

		return res.json({ message: "Deleted" });
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};
