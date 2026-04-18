const dijkstraManager = require("./dijkstraManager");
const graphBuilder = require("./graphBuilder");
const routeFormatter = require("./routeFormatter");
const routeValidator = require("./routeValidator");
const { routePlanningService, RoutePlanningServiceError } = require("./routePlanningService");

module.exports = {
	dijkstraManager,
	graphBuilder,
	routeFormatter,
	routeValidator,
	routePlanningService,
	RoutePlanningServiceError,

	// Backward-compatible named exports.
	findShortestPath: dijkstraManager.findShortestPath,
	buildDistrictGraph: graphBuilder.buildDistrictGraph,
	buildDistrictGraphWithMeta: graphBuilder.buildDistrictGraphWithMeta,
	buildRouteVisualization: routeFormatter.buildRouteVisualization,
};