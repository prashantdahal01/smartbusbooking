const routePathBuilder = require("./routePathBuilder");
const routeSegmentManager = require("./routeSegmentManager");
const routeSegmentFormatter = require("./routeSegmentFormatter");
const routeSegmentValidator = require("./routeSegmentValidator");
const { routeSegmentService, RouteSegmentServiceError } = require("./routeSegmentService");

module.exports = {
	routePathBuilder,
	routeSegmentManager,
	routeSegmentFormatter,
	routeSegmentValidator,
	routeSegmentService,
	RouteSegmentServiceError,

	// Convenience named exports.
	buildOrderedRoutePath: routePathBuilder.buildOrderedRoutePath,
	matchRouteSegment: routeSegmentManager.matchRouteSegment,
	filterSchedulesBySegment: routeSegmentService.filterSchedulesBySegment,
};