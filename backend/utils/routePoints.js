const normalizeText = (value) => String(value || "").trim();
const LOCATION_KEY_ALIASES = new Map([
	["kakarvitta", "kakarvita"],
	["kakarbhitta", "kakarvita"],
	["kakarbhita", "kakarvita"],
]);

const normalizeKey = (value) => {
	const normalizedText = normalizeText(value);
	const primaryText = normalizedText.split(",")[0] || normalizedText;

	const compact = primaryText
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");

	if (!compact) return "";

	const collapsed = compact.replace(/([a-z])\1+/g, "$1");
	return LOCATION_KEY_ALIASES.get(collapsed) || collapsed;
};

const isValidTimeHHmm = (value) => /^\d{2}:\d{2}$/.test(normalizeText(value));

const toStopName = (raw) => {
	if (raw === null || raw === undefined) return "";
	if (typeof raw === "string") return raw;
	if (typeof raw === "object") return raw.name || raw.city || "";
	return "";
};

const parsePositiveOrder = (value, fallbackValue) => {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) return fallbackValue;
	return Math.trunc(parsed);
};

const sortPointsByOrder = (points) =>
	[...(Array.isArray(points) ? points : [])].sort(
		(a, b) =>
			Number(a?.order || 0) - Number(b?.order || 0)
			|| normalizeText(a?.name).localeCompare(normalizeText(b?.name), undefined, { sensitivity: "base" })
	);

const normalizeRoutePointList = (points, { requireTime = true } = {}) => {
	if (points === undefined) return { ok: true, value: undefined };
	if (!Array.isArray(points)) return { ok: false, message: "Points must be an array" };

	const out = [];
	const seen = new Set();
	let nextOrder = 1;

	for (const raw of points) {
		const name = normalizeText(toStopName(raw));
		if (!name) continue;

		const key = normalizeKey(name);
		if (!key || seen.has(key)) continue;
		seen.add(key);

		const providedOrder = raw && typeof raw === "object" ? raw.order ?? raw.orderIndex : undefined;
		const order = parsePositiveOrder(providedOrder, nextOrder);
		nextOrder = Math.max(nextOrder + 1, order + 1);

		const timeCandidate = raw && typeof raw === "object"
			? normalizeText(raw.time || raw.absoluteTime || "")
			: "";

		if (requireTime && !isValidTimeHHmm(timeCandidate)) {
			return { ok: false, message: `time must be HH:mm for point: ${name}` };
		}

		out.push({
			name,
			time: timeCandidate,
			order,
		});
	}

	const sorted = sortPointsByOrder(out);
	return { ok: true, value: sorted };
};

const normalizeLegacyRouteStops = (route) => {
	const source = normalizeText(route?.source);
	const destination = normalizeText(route?.destination);
	const middleStops = (Array.isArray(route?.stops) ? route.stops : [])
		.map((stop, idx) => {
			const name = normalizeText(toStopName(stop));
			const order = stop && typeof stop === "object" ? parsePositiveOrder(stop.order, idx + 1) : idx + 1;
			return { name, order };
		})
		.filter((stop) => stop.name)
		.sort((a, b) => a.order - b.order)
		.map((stop) => stop.name);

	const merged = [source, ...middleStops, destination].filter(Boolean);
	const seen = new Set();
	return merged.filter((name) => {
		const key = normalizeKey(name);
		if (!key || seen.has(key)) return false;
		seen.add(key);
		return true;
	});
};

const getRoutePointLanes = (route) => {
	const normalizedBoarding = normalizeRoutePointList(route?.boardingPoints, { requireTime: false });
	const normalizedDropping = normalizeRoutePointList(route?.droppingPoints, { requireTime: false });

	const hasBoarding = normalizedBoarding.ok && Array.isArray(normalizedBoarding.value) && normalizedBoarding.value.length > 0;
	const hasDropping = normalizedDropping.ok && Array.isArray(normalizedDropping.value) && normalizedDropping.value.length > 0;

	if (hasBoarding || hasDropping) {
		return {
			boardingPoints: hasBoarding ? sortPointsByOrder(normalizedBoarding.value) : [],
			droppingPoints: hasDropping ? sortPointsByOrder(normalizedDropping.value) : [],
		};
	}

	const legacyPath = normalizeLegacyRouteStops(route);
	const source = normalizeText(route?.source);
	const destination = normalizeText(route?.destination);
	const middle = legacyPath.filter((name) => {
		const key = normalizeKey(name);
		return key && key !== normalizeKey(source) && key !== normalizeKey(destination);
	});

	const boardingPoints = [];
	if (source) {
		boardingPoints.push({ name: source, time: "", order: 1 });
	}
	middle.forEach((name, idx) => {
		boardingPoints.push({ name, time: "", order: idx + (source ? 2 : 1) });
	});

	const droppingPoints = [];
	middle.forEach((name, idx) => {
		droppingPoints.push({ name, time: "", order: idx + 1 });
	});
	if (destination) {
		droppingPoints.push({ name: destination, time: "", order: middle.length + 1 });
	}

	return {
		boardingPoints,
		droppingPoints,
	};
};

const buildRoutePath = (route) => {
	const { boardingPoints, droppingPoints } = getRoutePointLanes(route);
	const laneSequence = [
		...sortPointsByOrder(boardingPoints).map((point) => normalizeText(point?.name)),
		...sortPointsByOrder(droppingPoints).map((point) => normalizeText(point?.name)),
	].filter(Boolean);

	if (laneSequence.length === 0) {
		return normalizeLegacyRouteStops(route);
	}

	const seen = new Set();
	const out = [];

	laneSequence.forEach((name) => {
		const key = normalizeKey(name);
		if (!key || seen.has(key)) return;
		seen.add(key);
		out.push(name);
	});

	return out;
};

const buildRouteOrderIndexFromPath = (path) => {
	const map = new Map();
	(Array.isArray(path) ? path : []).forEach((name, index) => {
		const key = normalizeKey(name);
		if (!key || map.has(key)) return;
		map.set(key, index);
	});
	return map;
};

const buildRouteOrderIndex = (route) => {
	const routePath = buildRoutePath(route);
	return buildRouteOrderIndexFromPath(routePath);
};

const resolveRouteSegmentOnPath = (path, { sourceKey, destinationKey } = {}) => {
	const indexByKey = buildRouteOrderIndexFromPath(path);
	const hasSourceInput = Boolean(sourceKey);
	const hasDestinationInput = Boolean(destinationKey);

	const sourceIndex = hasSourceInput ? indexByKey.get(sourceKey) : undefined;
	const destinationIndex = hasDestinationInput ? indexByKey.get(destinationKey) : undefined;

	const sourceFound = !hasSourceInput || Number.isInteger(sourceIndex);
	const destinationFound = !hasDestinationInput || Number.isInteger(destinationIndex);
	const isInCorrectOrder = !hasSourceInput || !hasDestinationInput || sourceIndex < destinationIndex;

	return {
		path,
		indexByKey,
		sourceIndex,
		destinationIndex,
		sourceFound,
		destinationFound,
		isMatch: sourceFound && destinationFound && isInCorrectOrder,
	};
};

const resolveRouteSegment = (route, { source, destination, allowReverse = false } = {}) => {
	const forwardPath = buildRoutePath(route);
	const sourceKey = normalizeKey(source);
	const destinationKey = normalizeKey(destination);

	const forward = resolveRouteSegmentOnPath(forwardPath, { sourceKey, destinationKey });
	if (forward.isMatch || !allowReverse) {
		return {
			...forward,
			direction: forward.isMatch ? "forward" : null,
		};
	}

	const reversePath = [...forwardPath].reverse();
	const reverse = resolveRouteSegmentOnPath(reversePath, { sourceKey, destinationKey });
	if (reverse.isMatch) {
		return {
			...reverse,
			direction: "reverse",
		};
	}

	return {
		...forward,
		direction: null,
	};
};

module.exports = {
	normalizeKey,
	normalizeText,
	toStopName,
	isValidTimeHHmm,
	normalizeRoutePointList,
	normalizeLegacyRouteStops,
	getRoutePointLanes,
	buildRoutePath,
	buildRouteOrderIndex,
	resolveRouteSegment,
};
