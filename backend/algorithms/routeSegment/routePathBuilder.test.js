const test = require("node:test");
const assert = require("node:assert/strict");

const {
	buildOrderedRoutePath,
	buildOrderedRoutePathWithMeta,
	normalizePathKey,
} = require("./routePathBuilder");

test("buildOrderedRoutePathWithMeta: keeps stable order when multiple stops share same order", () => {
	const route = {
		source: "Kathmandu",
		destination: "Kakarvitta",
		stops: [
			{ name: "Kalanki", order: 2 },
			{ name: "Banepa", order: 1 },
			{ name: "Dhulikhel", order: 2 },
		],
	};

	const result = buildOrderedRoutePathWithMeta(route);

	assert.deepEqual(result.pathLabels, ["Kathmandu", "Banepa", "Kalanki", "Dhulikhel", "Kakarvitta"]);
	assert.deepEqual(result.path, ["kathmandu", "banepa", "kalanki", "dhulikhel", "kakarbhitta"]);
});

test("normalizePathKey: maps Kakarvita/Kakarvitta/Kakarbhitta variants to one key", () => {
	assert.equal(normalizePathKey("Kakarvitta"), "kakarbhitta");
	assert.equal(normalizePathKey("Kakarvita"), "kakarbhitta");
	assert.equal(normalizePathKey("Kakarbhitta"), "kakarbhitta");
});

test("buildOrderedRoutePath: deduplicates repeated source/stop/destination keys", () => {
	const route = {
		source: "Kathmandu",
		destination: "kathmandu",
		stops: [
			{ name: "Kalanki", order: 1 },
			{ name: "kalanki", order: 2 },
		],
	};

	const path = buildOrderedRoutePath(route);
	assert.deepEqual(path, ["kathmandu", "kalanki"]);
});