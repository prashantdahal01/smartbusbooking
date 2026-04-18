const { normalizeNodeKey } = require("./graphBuilder");

const toTitleCase = (value) =>
	String(value || "")
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");

const resolveDistrictLabel = (districtKey, labelByKey) => {
	const normalizedKey = normalizeNodeKey(districtKey);
	if (!normalizedKey) return "";

	if (labelByKey instanceof Map) {
		return labelByKey.get(normalizedKey) || toTitleCase(normalizedKey);
	}

	if (labelByKey && typeof labelByKey === "object") {
		const objectLabel = labelByKey[normalizedKey];
		if (objectLabel) return String(objectLabel);
	}

	return toTitleCase(normalizedKey);
};

const buildRouteVisualization = ({ pathKeys = [], graph = {}, labelByKey = new Map() } = {}) => {
	const normalizedPath = (Array.isArray(pathKeys) ? pathKeys : [])
		.map((nodeKey) => normalizeNodeKey(nodeKey))
		.filter(Boolean);

	const stops = [];
	const segments = [];
	let cumulativeDistance = 0;

	for (let index = 0; index < normalizedPath.length; index += 1) {
		const districtKey = normalizedPath[index];
		const districtLabel = resolveDistrictLabel(districtKey, labelByKey);
		const previousDistrictKey = index > 0 ? normalizedPath[index - 1] : null;

		let distanceFromPrevious = null;
		if (previousDistrictKey) {
			const rawDistance = Number(graph?.[previousDistrictKey]?.[districtKey]);
			if (Number.isFinite(rawDistance) && rawDistance >= 0) {
				distanceFromPrevious = rawDistance;
				cumulativeDistance += rawDistance;
			}

			segments.push({
				order: index,
				fromDistrictKey: previousDistrictKey,
				fromDistrictLabel: resolveDistrictLabel(previousDistrictKey, labelByKey),
				toDistrictKey: districtKey,
				toDistrictLabel: districtLabel,
				distance: distanceFromPrevious,
				cumulativeDistanceAtEnd: cumulativeDistance,
			});
		}

		stops.push({
			order: index + 1,
			districtKey,
			districtLabel,
			distanceFromPrevious,
			cumulativeDistance,
			isSource: index === 0,
			isDestination: index === normalizedPath.length - 1,
		});
	}

	return {
		stops,
		segments,
		totalDistance: stops.length > 0 ? stops[stops.length - 1].cumulativeDistance : 0,
	};
};

const formatRoutePlan = ({
	source,
	destination,
	sourceDistrict,
	destinationDistrict,
	distance,
	pathKeys,
	graph,
	graphSource,
	districtLabelByKey,
	message,
} = {}) => {
	const sourceText = String(source || "").trim();
	const destinationText = String(destination || "").trim();

	const visualization = buildRouteVisualization({
		pathKeys,
		graph,
		labelByKey: districtLabelByKey,
	});

	const hasValidPath = Number.isFinite(distance) && visualization.stops.length > 0;

	return {
		source: sourceText,
		destination: destinationText,
		sourceDistrict: sourceDistrict || null,
		destinationDistrict: destinationDistrict || null,
		distance: hasValidPath ? distance : null,
		path: hasValidPath ? visualization.stops.map((stop) => stop.districtLabel) : [],
		pathKeys: hasValidPath ? visualization.stops.map((stop) => stop.districtKey) : [],
		visualization: {
			stops: hasValidPath ? visualization.stops : [],
			segments: hasValidPath ? visualization.segments : [],
			totalDistance: hasValidPath ? distance : 0,
			unit: "km",
		},
		found: hasValidPath,
		graphSource: graphSource || null,
		message: hasValidPath ? null : message || "No route path exists between the requested districts",
	};
};

module.exports = {
	buildRouteVisualization,
	formatRoutePlan,
};