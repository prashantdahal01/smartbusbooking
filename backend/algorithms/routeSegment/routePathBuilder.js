const normalizeText = (value) => String(value || "").trim();

const LOCATION_KEY_ALIASES = new Map([
	["kakarvitta", "kakarbhitta"],
	["kakarvita", "kakarbhitta"],
	["kakarbhita", "kakarbhitta"],
]);

const normalizePathKey = (value) => {
	const normalizedText = normalizeText(value);
	const primaryText = normalizedText.split(",")[0] || normalizedText;

	const compact = primaryText
		.toLowerCase()
		.replace(/[^a-z0-9]/g, "");

	if (!compact) return "";

	const collapsed = compact.replace(/([a-z])\1+/g, "$1");
	return LOCATION_KEY_ALIASES.get(collapsed) || collapsed;
};

const toStopName = (raw) => {
	if (raw === null || raw === undefined) return "";
	if (typeof raw === "string") return raw;
	if (typeof raw === "object") {
		return raw.name || raw.city || raw.cityName || "";
	}
	return "";
};

const toStopOrder = (raw) => {
	const parsed = Number(raw);
	if (!Number.isFinite(parsed) || parsed <= 0) return Number.MAX_SAFE_INTEGER;
	return Math.trunc(parsed);
};

const getSortedMiddleStops = (route) => {
	const rawStops = Array.isArray(route?.stops) ? route.stops : [];

	const middleStops = rawStops
		.map((rawStop, index) => {
			const label = normalizeText(toStopName(rawStop));
			const key = normalizePathKey(label);
			if (!label || !key) return null;

			return {
				key,
				label,
				order: toStopOrder(rawStop?.order),
				index,
			};
		})
		.filter(Boolean)
		.sort((a, b) => {
			if (a.order !== b.order) return a.order - b.order;
			return a.index - b.index;
		});

	return middleStops;
};

const dedupeNodes = (nodes) => {
	const seen = new Set();
	const deduped = [];

	for (const node of nodes) {
		if (!node?.key || seen.has(node.key)) continue;
		seen.add(node.key);
		deduped.push(node);
	}

	return deduped;
};

const buildOrderedRouteNodes = (route = {}) => {
	const nodes = [];

	const sourceLabel = normalizeText(route?.source);
	const sourceKey = normalizePathKey(sourceLabel);
	if (sourceLabel && sourceKey) {
		nodes.push({ key: sourceKey, label: sourceLabel, kind: "source" });
	}

	nodes.push(
		...getSortedMiddleStops(route).map((stop) => ({
			key: stop.key,
			label: stop.label,
			kind: "stop",
		}))
	);

	const destinationLabel = normalizeText(route?.destination);
	const destinationKey = normalizePathKey(destinationLabel);
	if (destinationLabel && destinationKey) {
		nodes.push({ key: destinationKey, label: destinationLabel, kind: "destination" });
	}

	return dedupeNodes(nodes);
};

const buildOrderedRoutePath = (route = {}) => buildOrderedRouteNodes(route).map((node) => node.key);

const buildOrderedRoutePathWithMeta = (route = {}) => {
	const nodes = buildOrderedRouteNodes(route);
	const labelByKey = new Map();

	nodes.forEach((node) => {
		if (!node?.key || labelByKey.has(node.key)) return;
		labelByKey.set(node.key, node.label);
	});

	return {
		path: nodes.map((node) => node.key),
		pathLabels: nodes.map((node) => node.label),
		labelByKey,
		nodes,
	};
};

module.exports = {
	normalizeText,
	normalizePathKey,
	toStopName,
	buildOrderedRouteNodes,
	buildOrderedRoutePath,
	buildOrderedRoutePathWithMeta,
};