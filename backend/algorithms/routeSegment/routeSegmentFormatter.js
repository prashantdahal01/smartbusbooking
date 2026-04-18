const { getRoutePointLanes } = require("../../utils/routePoints");
const { normalizeText, normalizePathKey } = require("./routePathBuilder");

const toTitleCase = (value) =>
	String(value || "")
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");

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
		const key = normalizePathKey(point?.name);
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

		const key = normalizePathKey(name);
		if (!key || seen.has(key)) return;
		seen.add(key);

		const explicitOrder = Number(point?.order);
		const laneOrder = laneOrderByKey.get(key);
		const order = Number.isFinite(explicitOrder) && explicitOrder > 0
			? Math.trunc(explicitOrder)
			: Number.isFinite(laneOrder) && laneOrder > 0
				? laneOrder
				: idx + 1;

		out.push({
			name,
			time: normalizeText(point?.time),
			date: normalizeText(point?.date || fallbackDate),
			order,
		});
	});

	return out.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
};

const normalizeScheduleForOutput = (scheduleDoc) => {
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

const normalizeSchedulesForOutput = (schedules = []) =>
	(Array.isArray(schedules) ? schedules : [])
		.map((schedule) => normalizeScheduleForOutput(schedule))
		.filter(Boolean);

const upsertSchedulePointMeta = (pointByKey, point, fallbackDate) => {
	const name = normalizeText(point?.name);
	const key = normalizePathKey(name);
	if (!name || !key) return;

	const candidate = {
		name,
		time: normalizeText(point?.time),
		date: normalizeText(point?.date || fallbackDate),
	};

	const existing = pointByKey.get(key);
	if (!existing) {
		pointByKey.set(key, candidate);
		return;
	}

	pointByKey.set(key, {
		name: existing.name || candidate.name,
		time: existing.time || candidate.time,
		date: existing.date || candidate.date,
	});
};

const buildSchedulePointMetaByKey = ({ schedule, fallbackDate }) => {
	const pointByKey = new Map();

	(Array.isArray(schedule?.boardingPoints) ? schedule.boardingPoints : []).forEach((point) => {
		upsertSchedulePointMeta(pointByKey, point, fallbackDate);
	});
	(Array.isArray(schedule?.droppingPoints) ? schedule.droppingPoints : []).forEach((point) => {
		upsertSchedulePointMeta(pointByKey, point, fallbackDate);
	});

	return pointByKey;
};

const buildPathEntries = ({ path = [], pathLabels = [] } = {}) =>
	(Array.isArray(path) ? path : []).map((key, idx) => ({
		key,
		label: normalizeText(pathLabels[idx]) || toTitleCase(key),
		index: idx,
	}));

const buildSegmentLanePoints = ({ entries, pointByKey, fallbackDate, maxIndex, minIndex }) => {
	const upperBound = Number.isInteger(maxIndex) ? maxIndex : null;
	const lowerBound = Number.isInteger(minIndex) ? minIndex : null;

	return (Array.isArray(entries) ? entries : [])
		.filter((entry) => {
			if (upperBound !== null && entry.index > upperBound) return false;
			if (lowerBound !== null && entry.index < lowerBound) return false;
			return true;
		})
		.map((entry) => {
			const meta = pointByKey.get(entry.key);
			return {
				name: normalizeText(meta?.name || entry.label),
				time: normalizeText(meta?.time),
				date: normalizeText(meta?.date || fallbackDate),
				order: entry.index + 1,
			};
		});
};

const formatMatchedScheduleSegment = ({ schedule, matchResult, requestedSource, requestedDestination } = {}) => {
	if (!schedule || !matchResult?.isMatch) return null;

	const scheduleDate = normalizeText(schedule?.date);
	const pointByKey = buildSchedulePointMetaByKey({ schedule, fallbackDate: scheduleDate });
	const fullPathEntries = buildPathEntries({ path: matchResult.fullPath, pathLabels: matchResult.fullPathLabels });
	const segmentEntries = buildPathEntries({ path: matchResult.segmentPath, pathLabels: matchResult.segmentPathLabels });

	const sourceIndex = Number.isInteger(matchResult.sourceIndex) ? matchResult.sourceIndex : null;
	const destinationIndex = Number.isInteger(matchResult.destinationIndex) ? matchResult.destinationIndex : null;

	const scoped = { ...schedule };
	scoped.boardingPoints = buildSegmentLanePoints({
		entries: fullPathEntries,
		pointByKey,
		fallbackDate: scheduleDate,
		maxIndex: sourceIndex,
	});
	scoped.droppingPoints = buildSegmentLanePoints({
		entries: fullPathEntries,
		pointByKey,
		fallbackDate: scheduleDate,
		minIndex: destinationIndex,
	});

	const safeDirection = matchResult.direction || "forward";
	scoped.segmentPath = segmentEntries.map((entry) => entry.label);
	scoped.segmentDistance = null;
	scoped.searchSegment = {
		source: sourceIndex !== null ? fullPathEntries[sourceIndex]?.label || normalizeText(requestedSource) || null : normalizeText(requestedSource) || null,
		destination: destinationIndex !== null ? fullPathEntries[destinationIndex]?.label || normalizeText(requestedDestination) || null : normalizeText(requestedDestination) || null,
		sourceIndex,
		destinationIndex,
		direction: safeDirection,
		isReverse: safeDirection === "reverse",
		requestedSource: normalizeText(requestedSource) || null,
		requestedDestination: normalizeText(requestedDestination) || null,
		segmentPath: scoped.segmentPath,
	};

	return scoped;
};

module.exports = {
	withRoutePointCompatibility,
	normalizeScheduleForOutput,
	normalizeSchedulesForOutput,
	formatMatchedScheduleSegment,
};