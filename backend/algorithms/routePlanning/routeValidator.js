class RoutePlanningValidationError extends Error {
	constructor(message, details) {
		super(message);
		this.name = "RoutePlanningValidationError";
		this.statusCode = 400;
		this.code = "ROUTE_VALIDATION_ERROR";
		this.details = details || null;
	}
}

const normalizeRouteInput = (value) => String(value || "").trim();
const normalizeRouteKey = (value) => normalizeRouteInput(value).toLowerCase();

const validateRoutePlanInput = ({ source, destination } = {}, { requireBoth = true } = {}) => {
	const normalizedSource = normalizeRouteInput(source);
	const normalizedDestination = normalizeRouteInput(destination);

	if (requireBoth && (!normalizedSource || !normalizedDestination)) {
		throw new RoutePlanningValidationError("source and destination are required", {
			sourceProvided: Boolean(normalizedSource),
			destinationProvided: Boolean(normalizedDestination),
		});
	}

	return {
		source: normalizedSource,
		destination: normalizedDestination,
	};
};

const isRoutePlanningValidationError = (error) =>
	Boolean(
		error
			&& (error instanceof RoutePlanningValidationError
				|| error.name === "RoutePlanningValidationError"
				|| error.code === "ROUTE_VALIDATION_ERROR")
	);

module.exports = {
	RoutePlanningValidationError,
	normalizeRouteInput,
	normalizeRouteKey,
	validateRoutePlanInput,
	isRoutePlanningValidationError,
};