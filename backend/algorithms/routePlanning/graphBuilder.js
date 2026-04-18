const normalizeNodeKey = (value) => String(value || "").trim().toLowerCase();

// Static weighted fallback graph used only when no valid DB route edges exist.
const FALLBACK_CONNECTIONS = [
	["kathmandu", "bhaktapur", 16],
	["kathmandu", "lalitpur", 8],
	["kathmandu", "chitwan", 150],
	["bhaktapur", "kavre", 26],
	["kavre", "sindhuli", 90],
	["sindhuli", "sunsari", 170],
	["sunsari", "morang", 25],
	["morang", "jhapa", 60],
	["chitwan", "sindhuli", 145],
	["chitwan", "pokhara", 146],
];

const ensureNode = (graph, nodeKey) => {
	if (!graph[nodeKey]) graph[nodeKey] = {};
};

const addUndirectedEdge = (graph, fromNode, toNode, weight) => {
	const fromKey = normalizeNodeKey(fromNode);
	const toKey = normalizeNodeKey(toNode);
	const numericWeight = Number(weight);

	if (!fromKey || !toKey || fromKey === toKey) return;
	if (!Number.isFinite(numericWeight) || numericWeight <= 0) return;

	ensureNode(graph, fromKey);
	ensureNode(graph, toKey);

	const currentForward = Number(graph[fromKey][toKey]);
	const currentBackward = Number(graph[toKey][fromKey]);

	// Keep the shortest edge if duplicate route edges are present.
	graph[fromKey][toKey] = Number.isFinite(currentForward)
		? Math.min(currentForward, numericWeight)
		: numericWeight;
	graph[toKey][fromKey] = Number.isFinite(currentBackward)
		? Math.min(currentBackward, numericWeight)
		: numericWeight;
};

const buildGraphFromConnections = (connections) => {
	const graph = {};
	for (const [fromNode, toNode, weight] of connections) {
		addUndirectedEdge(graph, fromNode, toNode, weight);
	}
	return graph;
};

const FALLBACK_WEIGHTED_GRAPH = buildGraphFromConnections(FALLBACK_CONNECTIONS);

const cloneGraph = (graph) => {
	const clone = {};
	for (const [nodeKey, neighbors] of Object.entries(graph || {})) {
		clone[nodeKey] = { ...(neighbors || {}) };
	}
	return clone;
};

const hasAnyEdges = (graph) =>
	Object.values(graph || {}).some((neighbors) => Object.keys(neighbors || {}).length > 0);

const buildGraphFromRoutes = (routes = []) => {
	const graph = {};

	for (const route of Array.isArray(routes) ? routes : []) {
		const sourceDistrict = route?.sourceDistrict || route?.source;
		const destinationDistrict = route?.destinationDistrict || route?.destination;
		addUndirectedEdge(graph, sourceDistrict, destinationDistrict, route?.distance);
	}

	return graph;
};

/**
 * Database-first behavior:
 * - If DB route data contains valid weighted edges, that graph is used.
 * - Fallback graph is used only when no valid DB edges are present.
 */
const buildGraphWithFallback = (routes = []) => {
	const graph = buildGraphFromRoutes(routes);

	if (hasAnyEdges(graph)) {
		return { graph, graphSource: "database" };
	}

	return {
		graph: cloneGraph(FALLBACK_WEIGHTED_GRAPH),
		graphSource: "fallback",
	};
};

const buildDistrictGraph = (routes = []) => buildGraphWithFallback(routes).graph;

const buildDistrictGraphWithMeta = (routes = []) => buildGraphWithFallback(routes);

const createDistrictLabelByKey = (routes = [], { sourceDistrict, destinationDistrict } = {}) => {
	const labelByKey = new Map();

	for (const route of Array.isArray(routes) ? routes : []) {
		const sourceDistrictName = String(route?.sourceDistrict || "").trim();
		const destinationDistrictName = String(route?.destinationDistrict || "").trim();

		if (sourceDistrictName) {
			labelByKey.set(normalizeNodeKey(sourceDistrictName), sourceDistrictName);
		}

		if (destinationDistrictName) {
			labelByKey.set(normalizeNodeKey(destinationDistrictName), destinationDistrictName);
		}
	}

	const sourceDistrictName = String(sourceDistrict || "").trim();
	const destinationDistrictName = String(destinationDistrict || "").trim();

	if (sourceDistrictName) {
		labelByKey.set(normalizeNodeKey(sourceDistrictName), sourceDistrictName);
	}
	if (destinationDistrictName) {
		labelByKey.set(normalizeNodeKey(destinationDistrictName), destinationDistrictName);
	}

	return labelByKey;
};

module.exports = {
	normalizeNodeKey,
	buildGraphFromRoutes,
	buildGraphWithFallback,
	buildDistrictGraph,
	buildDistrictGraphWithMeta,
	createDistrictLabelByKey,
};