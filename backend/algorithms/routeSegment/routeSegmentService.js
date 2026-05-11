const { matchRouteSegment } = require("./routeSegmentManager");
const {
	RouteSegmentValidationError,
	validateRouteSegmentInput,
	isRouteSegmentValidationError,
} = require("./routeSegmentValidator");
const {
	normalizeSchedulesForOutput,
	normalizeScheduleForOutput,
	formatMatchedScheduleSegment,
} = require("./routeSegmentFormatter");
const { buildOrderedRoutePathWithMeta, normalizeText, normalizePathKey } = require("./routePathBuilder");

class RouteSegmentServiceError extends Error {
	constructor(message, options = {}) {
		super(message);
		this.name = "RouteSegmentServiceError";
		this.statusCode = options.statusCode || 500;
		this.code = options.code || "ROUTE_SEGMENT_SERVICE_ERROR";
		this.details = options.details || null;
	}
}

const toServiceError = (error) => {
	if (error instanceof RouteSegmentServiceError) return error;

	if (error instanceof RouteSegmentValidationError || isRouteSegmentValidationError(error)) {
		return new RouteSegmentServiceError(error.message || "Invalid route segment input", {
			statusCode: error.statusCode || 400,
			code: error.code || "ROUTE_SEGMENT_VALIDATION_ERROR",
			details: error.details || null,
		});
	}

	return new RouteSegmentServiceError(error?.message || "Route segment matching failed", {
		statusCode: 500,
		code: "ROUTE_SEGMENT_SERVICE_ERROR",
	});
};

const filterSchedulesBySegment = async (schedules, source, destination, options = {}) => {
	try {
		const requireBoth = options.requireBoth !== false;
		const allowPartial = Boolean(options.allowPartial);
		const normalizedInput = validateRouteSegmentInput(
			{ source, destination },
			{ requireBoth }
		);

		const compatibleSchedules = normalizeSchedulesForOutput(schedules);
		const reverseRouteExistsCache = new Map();
		const matches = [];

		for (const schedule of compatibleSchedules) {
			if (!schedule?.route) continue;

			const result = await matchRouteSegment(
				schedule.route,
				normalizedInput.source,
				normalizedInput.destination,
				{
					sourceKey: normalizedInput.sourceKey,
					destinationKey: normalizedInput.destinationKey,
					allowPartial,
					reverseRouteExistsCache,
				}
			);

			if (!result?.isMatch) continue;

			const formatted = formatMatchedScheduleSegment({
				schedule,
				matchResult: result,
				requestedSource: normalizedInput.source,
				requestedDestination: normalizedInput.destination,
			});

			if (formatted) matches.push(formatted);
		}

		return matches;
	} catch (error) {
		throw toServiceError(error);
	}
};

const buildSearchOptions = (schedules = []) => {
	const compatibleSchedules = normalizeSchedulesForOutput(schedules);

	const sourcesByKey = new Map();
	const destinationsByKey = new Map();
	const pairsByKey = new Map();

	const addSource = (value) => {
		const text = normalizeText(value);
		const key = normalizePathKey(text);
		if (!text || !key || sourcesByKey.has(key)) return;
		sourcesByKey.set(key, text);
	};

	const addDestination = (value) => {
		const text = normalizeText(value);
		const key = normalizePathKey(text);
		if (!text || !key || destinationsByKey.has(key)) return;
		destinationsByKey.set(key, text);
	};

	const addPair = (sourceValue, destinationValue) => {
		const sourceText = normalizeText(sourceValue);
		const destinationText = normalizeText(destinationValue);
		const sourceKey = normalizePathKey(sourceText);
		const destinationKey = normalizePathKey(destinationText);

		if (!sourceText || !destinationText || !sourceKey || !destinationKey || sourceKey === destinationKey) return;

		const pairKey = `${sourceKey}|||${destinationKey}`;
		if (pairsByKey.has(pairKey)) return;

		pairsByKey.set(pairKey, {
			source: sourceText,
			destination: destinationText,
		});
	};

	for (const schedule of compatibleSchedules) {
		const route = schedule?.route;
		if (!route) continue;

		const sourceDistrict = normalizeText(route?.sourceDistrict);
		const destinationDistrict = normalizeText(route?.destinationDistrict);
		if (sourceDistrict) {
			addSource(sourceDistrict);
			addDestination(sourceDistrict);
		}
		if (destinationDistrict) {
			addSource(destinationDistrict);
			addDestination(destinationDistrict);
		}
		if (sourceDistrict && destinationDistrict) {
			addPair(sourceDistrict, destinationDistrict);
		}

		const { path, pathLabels } = buildOrderedRoutePathWithMeta(route);
		if (!Array.isArray(path) || path.length < 2) continue;

		pathLabels.forEach((label) => {
			addSource(label);
			addDestination(label);
		});

		for (let sourceIndex = 0; sourceIndex < path.length - 1; sourceIndex += 1) {
			for (let destinationIndex = sourceIndex + 1; destinationIndex < path.length; destinationIndex += 1) {
				addPair(pathLabels[sourceIndex], pathLabels[destinationIndex]);
			}
		}
	}

	const sources = Array.from(sourcesByKey.values()).sort((a, b) => a.localeCompare(b));
	const destinations = Array.from(destinationsByKey.values()).sort((a, b) => a.localeCompare(b));
	const pairs = Array.from(pairsByKey.values()).sort((a, b) => {
		const sourceCompare = a.source.localeCompare(b.source);
		if (sourceCompare !== 0) return sourceCompare;
		return a.destination.localeCompare(b.destination);
	});

	return { sources, destinations, pairs };
};

const formatError = (error) => {
	const mapped = toServiceError(error);
	return {
		statusCode: mapped.statusCode,
		payload: { message: mapped.message },
	};
};

const isRouteSegmentError = (error) =>
	error instanceof RouteSegmentServiceError
	|| error instanceof RouteSegmentValidationError
	|| isRouteSegmentValidationError(error);

const routeSegmentService = {
	filterSchedulesBySegment,
	buildSearchOptions,
	normalizeScheduleForOutput,
	normalizeSchedulesForOutput,
	formatError,
	isRouteSegmentError,
};

module.exports = {
	RouteSegmentServiceError,
	routeSegmentService,
};

// Convenience helper to validate a single route for forward match only.
routeSegmentService.isValidSegment = async (route, source, destination, options = {}) => {
	try {
		const normalizedSource = String(source || "").trim();
		const normalizedDestination = String(destination || "").trim();
		const result = await matchRouteSegment(route, normalizedSource, normalizedDestination, options);
		return Boolean(result && result.isMatch && result.direction === "forward");
	} catch (error) {
		throw toServiceError(error);
	}
};