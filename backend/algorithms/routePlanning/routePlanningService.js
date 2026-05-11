const { Route } = require("../../modules/route/route.model");
const districtDataService = require("../../services/districtData.service");
const { findShortestPath } = require("./dijkstraManager");
const { buildGraphWithFallback, createDistrictLabelByKey } = require("./graphBuilder");
const { formatRoutePlan } = require("./routeFormatter");
const {
	validateRoutePlanInput,
	isRoutePlanningValidationError,
} = require("./routeValidator");

class RoutePlanningServiceError extends Error {
	constructor(message, options = {}) {
		super(message);
		this.name = "RoutePlanningServiceError";
		this.statusCode = options.statusCode || 500;
		this.code = options.code || "ROUTE_PLANNING_ERROR";
		this.details = options.details || null;
	}
}

const wrapError = (error) => {
	if (error instanceof RoutePlanningServiceError) {
		return error;
	}

	if (isRoutePlanningValidationError(error)) {
		return new RoutePlanningServiceError(error.message || "Invalid route plan input", {
			statusCode: error.statusCode || 400,
			code: error.code || "ROUTE_VALIDATION_ERROR",
			details: error.details || null,
		});
	}

	return new RoutePlanningServiceError(error?.message || "Failed to compute route plan", {
		statusCode: 500,
		code: "ROUTE_PLANNING_ERROR",
	});
};

const getRoutePlan = async ({ source, destination, requireBoth = true } = {}) => {
	try {
		const normalized = validateRoutePlanInput({ source, destination }, { requireBoth });
		const sourceText = normalized.source;
		const destinationText = normalized.destination;

		if (!sourceText || !destinationText) {
			return formatRoutePlan({
				source: sourceText,
				destination: destinationText,
				message: "source and destination are required",
			});
		}

		const [sourceDistrictName, destinationDistrictName] = await Promise.all([
			districtDataService.resolveDistrictNameForPlace(sourceText),
			districtDataService.resolveDistrictNameForPlace(destinationText),
		]);

		if (!sourceDistrictName || !destinationDistrictName) {
			return formatRoutePlan({
				source: sourceText,
				destination: destinationText,
				sourceDistrict: sourceDistrictName || null,
				destinationDistrict: destinationDistrictName || null,
				message: "Could not resolve district for source or destination",
			});
		}

		const routes = await Route.find({}).select("sourceDistrict destinationDistrict distance").lean();
		const { graph, graphSource } = buildGraphWithFallback(routes);
		const result = findShortestPath(graph, sourceDistrictName, destinationDistrictName);

		if (!Array.isArray(result.path) || result.path.length === 0 || !Number.isFinite(result.distance)) {
			return formatRoutePlan({
				source: sourceText,
				destination: destinationText,
				sourceDistrict: sourceDistrictName,
				destinationDistrict: destinationDistrictName,
				graphSource,
				message: "No route path exists between the requested districts",
			});
		}

		const districtLabelByKey = createDistrictLabelByKey(routes, {
			sourceDistrict: sourceDistrictName,
			destinationDistrict: destinationDistrictName,
		});

		return formatRoutePlan({
			source: sourceText,
			destination: destinationText,
			sourceDistrict: sourceDistrictName,
			destinationDistrict: destinationDistrictName,
			distance: result.distance,
			pathKeys: result.path,
			graph,
			graphSource,
			districtLabelByKey,
		});
	} catch (error) {
		throw wrapError(error);
	}
};

const formatError = (error) => {
	const wrappedError = wrapError(error);
	return {
		statusCode: wrappedError.statusCode,
		payload: { message: wrappedError.message },
	};
};

const routePlanningService = {
	getRoutePlan,
	formatError,
};

module.exports = {
	routePlanningService,
	RoutePlanningServiceError,
};