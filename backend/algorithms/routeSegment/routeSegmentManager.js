const Route = require("../../models/Route");
const { normalizeText, normalizePathKey, buildOrderedRoutePathWithMeta } = require("./routePathBuilder");

const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const buildReverseCacheKey = (route, path) => {
	const pathList = Array.isArray(path) ? path : [];
	if (pathList.length >= 2) {
		return `${pathList[0]}|||${pathList[pathList.length - 1]}`;
	}

	const sourceKey = normalizePathKey(route?.source);
	const destinationKey = normalizePathKey(route?.destination);
	return `${sourceKey}|||${destinationKey}`;
};

const queryReverseRouteExists = async (route) => {
	const sourceText = normalizeText(route?.source);
	const destinationText = normalizeText(route?.destination);
	const sourceDistrict = normalizeText(route?.sourceDistrict);
	const destinationDistrict = normalizeText(route?.destinationDistrict);

	const clauses = [];

	if (sourceText && destinationText) {
		clauses.push({
			source: new RegExp(`^${escapeRegex(destinationText)}$`, "i"),
			destination: new RegExp(`^${escapeRegex(sourceText)}$`, "i"),
		});
	}

	if (sourceDistrict && destinationDistrict) {
		clauses.push({
			sourceDistrict: new RegExp(`^${escapeRegex(destinationDistrict)}$`, "i"),
			destinationDistrict: new RegExp(`^${escapeRegex(sourceDistrict)}$`, "i"),
		});
	}

	if (clauses.length === 0) return false;

	const query = { $or: clauses };
	if (route?._id) {
		query._id = { $ne: route._id };
	}

	const exists = await Route.exists(query);
	return Boolean(exists);
};

const hasReverseRoute = async (route, path, options = {}) => {
	if (typeof options.reverseRouteExistsResolver === "function") {
		const result = await options.reverseRouteExistsResolver(route, path);
		return Boolean(result);
	}

	const cache = options.reverseRouteExistsCache instanceof Map
		? options.reverseRouteExistsCache
		: null;
	const cacheKey = buildReverseCacheKey(route, path);

	if (cache && cache.has(cacheKey)) {
		return Boolean(cache.get(cacheKey));
	}

	const exists = await queryReverseRouteExists(route);
	if (cache) cache.set(cacheKey, exists);
	return exists;
};

const matchRouteSegment = async (route, source, destination, options = {}) => {
	const allowPartial = Boolean(options.allowPartial);
	const sourceKey = options.sourceKey || normalizePathKey(source);
	const destinationKey = options.destinationKey || normalizePathKey(destination);

	const { path, pathLabels } = buildOrderedRoutePathWithMeta(route);
	const sourceIndex = sourceKey ? path.indexOf(sourceKey) : -1;
	const destinationIndex = destinationKey ? path.indexOf(destinationKey) : -1;

	const baseResult = {
		isMatch: false,
		sourceIndex: Number.isInteger(sourceIndex) && sourceIndex >= 0 ? sourceIndex : null,
		destinationIndex: Number.isInteger(destinationIndex) && destinationIndex >= 0 ? destinationIndex : null,
		segmentPath: [],
		segmentPathLabels: [],
		fullPath: path,
		fullPathLabels: pathLabels,
		direction: null,
		reverseRouteExists: false,
		reason: "not_matched",
	};

	if (!path.length) {
		return { ...baseResult, reason: "empty_route_path" };
	}

	if (allowPartial && sourceKey && !destinationKey) {
		if (sourceIndex < 0) return { ...baseResult, reason: "source_not_found" };
		return {
			...baseResult,
			isMatch: true,
			sourceIndex,
			destinationIndex: null,
			segmentPath: path.slice(sourceIndex),
			segmentPathLabels: pathLabels.slice(sourceIndex),
			direction: "forward",
			reason: "source_only_match",
		};
	}

	if (allowPartial && !sourceKey && destinationKey) {
		if (destinationIndex < 0) return { ...baseResult, reason: "destination_not_found" };
		return {
			...baseResult,
			isMatch: true,
			sourceIndex: null,
			destinationIndex,
			segmentPath: path.slice(0, destinationIndex + 1),
			segmentPathLabels: pathLabels.slice(0, destinationIndex + 1),
			direction: "forward",
			reason: "destination_only_match",
		};
	}

	if (sourceIndex < 0) return { ...baseResult, reason: "source_not_found" };
	if (destinationIndex < 0) return { ...baseResult, reason: "destination_not_found" };

	if (sourceIndex === destinationIndex) {
		return { ...baseResult, sourceIndex, destinationIndex, reason: "same_source_destination" };
	}

	if (sourceIndex < destinationIndex) {
		return {
			...baseResult,
			isMatch: true,
			sourceIndex,
			destinationIndex,
			segmentPath: path.slice(sourceIndex, destinationIndex + 1),
			segmentPathLabels: pathLabels.slice(sourceIndex, destinationIndex + 1),
			direction: "forward",
			reason: "matched",
		};
	}

	const reverseRouteExists = await hasReverseRoute(route, path, options);
	return {
		...baseResult,
		sourceIndex,
		destinationIndex,
		direction: "reverse",
		reverseRouteExists,
		reason: reverseRouteExists ? "reverse_route_required" : "reverse_route_missing",
	};
};

module.exports = {
	matchRouteSegment,
	hasReverseRoute,
};