const { normalizeText, normalizePathKey } = require("./routePathBuilder");

class RouteSegmentValidationError extends Error {
	constructor(message, details = null) {
		super(message);
		this.name = "RouteSegmentValidationError";
		this.statusCode = 400;
		this.code = "ROUTE_SEGMENT_VALIDATION_ERROR";
		this.details = details;
	}
}

const validateRouteSegmentInput = ({ source, destination } = {}, { requireBoth = true } = {}) => {
	const sourceText = normalizeText(source);
	const destinationText = normalizeText(destination);

	if (requireBoth && (!sourceText || !destinationText)) {
		throw new RouteSegmentValidationError("source and destination are required", {
			sourceProvided: Boolean(sourceText),
			destinationProvided: Boolean(destinationText),
		});
	}

	if (!requireBoth && !sourceText && !destinationText) {
		return {
			source: "",
			destination: "",
			sourceKey: "",
			destinationKey: "",
		};
	}

	const sourceKey = sourceText ? normalizePathKey(sourceText) : "";
	const destinationKey = destinationText ? normalizePathKey(destinationText) : "";

	if (sourceText && !sourceKey) {
		throw new RouteSegmentValidationError("source is invalid");
	}
	if (destinationText && !destinationKey) {
		throw new RouteSegmentValidationError("destination is invalid");
	}

	if (sourceKey && destinationKey && sourceKey === destinationKey) {
		throw new RouteSegmentValidationError("source and destination cannot be the same");
	}

	return {
		source: sourceText,
		destination: destinationText,
		sourceKey,
		destinationKey,
	};
};

const isRouteSegmentValidationError = (error) =>
	Boolean(
		error
			&& (error instanceof RouteSegmentValidationError
				|| error.name === "RouteSegmentValidationError"
				|| error.code === "ROUTE_SEGMENT_VALIDATION_ERROR")
	);

module.exports = {
	RouteSegmentValidationError,
	validateRouteSegmentInput,
	isRouteSegmentValidationError,
};