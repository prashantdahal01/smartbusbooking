const mongoose = require("mongoose");

const Route = require("../models/Route");
const Stop = require("../models/Stop");

const normalizeText = (value) => String(value || "").trim();
const normalizeKey = (value) => normalizeText(value).toLowerCase();
const normalizeStopType = (value) => {
	const type = normalizeText(value).toLowerCase();
	if (type === "drop") return "drop";
	if (type === "both") return "both";
	return "pickup";
};

const dedupeOrderedNames = (names) => {
	const seen = new Set();
	const out = [];
	for (const rawName of Array.isArray(names) ? names : []) {
		const name = normalizeText(rawName);
		const key = normalizeKey(name);
		if (!name || !key || seen.has(key)) continue;
		seen.add(key);
		out.push({ name, key });
	}
	return out;
};

const formatPoints = (points) =>
	dedupeOrderedNames(points).map((point, index) => ({
		name: point.name,
		order: index + 1,
		time: "00:00",
	}));

const toStopsPayload = (orderedStops) =>
	(Array.isArray(orderedStops) ? orderedStops : []).map((stop, index) => ({
		name: stop.name,
		order: index + 1,
		type: normalizeStopType(stop.type),
	}));

const stopTypeUsesPickupLane = (type) => {
	const normalized = normalizeStopType(type);
	return normalized === "pickup" || normalized === "both";
};

const stopTypeUsesDropLane = (type) => normalizeStopType(type) === "drop";

const normalizeOrderedStops = ({ route, stopDocs }) => {
	const sourceKey = normalizeKey(route?.source);
	const destinationKey = normalizeKey(route?.destination);
	const seen = new Set();
	const out = [];

	for (const stop of Array.isArray(stopDocs) ? stopDocs : []) {
		const name = normalizeText(stop?.cityName || stop?.city || stop?.name);
		const key = normalizeKey(name);
		if (!name || !key) continue;
		if (key === sourceKey || key === destinationKey) continue;
		if (seen.has(key)) continue;
		seen.add(key);

		const rawOrder = Number(stop?.order);
		const order = Number.isFinite(rawOrder) && rawOrder > 0 ? Math.trunc(rawOrder) : out.length + 1;

		out.push({
			name,
			order,
			type: normalizeStopType(stop?.type),
		});
	}

	out.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
	return out.map((stop, index) => ({ ...stop, order: index + 1 }));
};

const buildSplitStops = (orderedStops) => {
	const stops = Array.isArray(orderedStops) ? orderedStops : [];
	const pickupStops = stops.filter((stop) => stopTypeUsesPickupLane(stop?.type));
	const dropStops = stops.filter((stop) => stopTypeUsesDropLane(stop?.type));

	if (pickupStops.length === 0 || dropStops.length === 0) {
		return stops;
	}

	const seen = new Set();
	const out = [];
	for (const stop of [...pickupStops, ...dropStops]) {
		const key = normalizeKey(stop?.name);
		if (!key || seen.has(key)) continue;
		seen.add(key);
		out.push(stop);
	}

	return out;
};

const splitPathIntoLanes = ({ fullPath, orderedStops, sourceName, destinationName }) => {
	const sourceKey = normalizeKey(sourceName);
	const destinationKey = normalizeKey(destinationName);

	let splitIndex = (Array.isArray(orderedStops) ? orderedStops : []).findIndex((stop) => stop.type === "drop");
	if (splitIndex === -1) {
		splitIndex = Math.floor((Array.isArray(fullPath) ? fullPath.length : 0) / 2);
	}
	splitIndex = Math.max(0, Math.min(splitIndex, Math.max((Array.isArray(fullPath) ? fullPath.length : 1) - 1, 0)));

	let boarding = (Array.isArray(fullPath) ? fullPath : []).slice(0, splitIndex + 1);
	let dropping = (Array.isArray(fullPath) ? fullPath : []).slice(splitIndex + 1);

	boarding = dedupeOrderedNames(boarding)
		.map((point) => point.name)
		.filter((name) => normalizeKey(name) !== destinationKey);

	dropping = dedupeOrderedNames(dropping)
		.map((point) => point.name)
		.filter((name) => normalizeKey(name) !== sourceKey);

	if (sourceName) {
		boarding = [
			sourceName,
			...boarding.filter((name) => normalizeKey(name) !== sourceKey),
		];
	}

	if (destinationName) {
		dropping = [
			...dropping.filter((name) => normalizeKey(name) !== destinationKey),
			destinationName,
		];
	}

	boarding = dedupeOrderedNames(boarding).map((point) => point.name);
	dropping = dedupeOrderedNames(dropping).map((point) => point.name);

	return { boarding, dropping };
};

const buildSyncedRoutePointsPayload = ({ route, stopDocs }) => {
	const sourceName = normalizeText(route?.source);
	const destinationName = normalizeText(route?.destination);
	const orderedStops = normalizeOrderedStops({ route, stopDocs });
 	const splitStops = buildSplitStops(orderedStops);

	const boardingSequence = [
		...(sourceName ? [sourceName] : []),
		...splitStops.map((stop) => stop.name),
	];
	const fullPath = dedupeOrderedNames([
		...boardingSequence,
		...(destinationName ? [destinationName] : []),
	]).map((point) => point.name);

	const { boarding, dropping } = splitPathIntoLanes({
		fullPath,
		orderedStops: splitStops,
		sourceName,
		destinationName,
	});

	return {
		boardingPoints: formatPoints(boarding),
		droppingPoints: formatPoints(dropping),
		stops: toStopsPayload(orderedStops),
		fullPath,
		boarding,
		dropping,
	};
};

const getRouteStopsOrdered = (routeId) =>
	Stop.find({ route: routeId })
		.sort({ order: 1 })
		.select("cityName city type order")
		.lean();

const getRouteForSync = async (routeId) => {
	if (!mongoose.isValidObjectId(routeId)) return null;
	return Route.findById(routeId)
		.select("_id source destination")
		.lean();
};

const syncRoutePoints = async (routeId) => {
	const route = await getRouteForSync(routeId);
	if (!route) return null;

	const stopDocs = await getRouteStopsOrdered(route._id);
	const next = buildSyncedRoutePointsPayload({ route, stopDocs });
	const payload = {
		boardingPoints: next.boardingPoints,
		droppingPoints: next.droppingPoints,
		stops: next.stops,
	};

	console.log("FULL PATH:", next.fullPath);
	console.log("BOARDING:", next.boarding);
	console.log("DROPPING:", next.dropping);

	const updated = await Route.findByIdAndUpdate(
		route._id,
		{ $set: payload },
		{ new: true }
	).lean();

	return updated;
};

const syncRoutePointsForIds = async (routeIds = []) => {
	const uniqueIds = Array.from(new Set((Array.isArray(routeIds) ? routeIds : []).map((id) => String(id || "")).filter(Boolean)));
	const synced = [];

	for (const routeId of uniqueIds) {
		if (!mongoose.isValidObjectId(routeId)) continue;
		const updated = await syncRoutePoints(routeId);
		if (updated) synced.push(updated);
	}

	return synced;
};

module.exports = {
	normalizeRoutePointKey: normalizeKey,
	buildSyncedRoutePointsPayload,
	syncRoutePoints,
	syncRoutePointsForIds,
};
