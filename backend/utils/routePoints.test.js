const test = require("node:test");
const assert = require("node:assert/strict");

const { buildRoutePath, resolveRouteSegment } = require("./routePoints");

const route = {
	source: "Kathmandu",
	destination: "Kakarvita",
	stops: [
		{ name: "Kalanki", order: 1 },
		{ name: "Damak", order: 2 },
		{ name: "Birtamode", order: 3 },
	],
};

const routeWithVariantSpelling = {
	...route,
	destination: "Kakarvitta",
};

test("buildRoutePath: builds ordered full path from legacy source/stops/destination", () => {
	const path = buildRoutePath(route);
	assert.deepEqual(path, ["Kathmandu", "Kalanki", "Damak", "Birtamode", "Kakarvita"]);
});

test("resolveRouteSegment: matches intermediate destination when order is correct", () => {
	const result = resolveRouteSegment(route, { source: "Kathmandu", destination: "Damak" });

	assert.equal(result.isMatch, true);
	assert.equal(result.sourceIndex, 0);
	assert.equal(result.destinationIndex, 2);
	assert.equal(result.direction, "forward");
});

test("resolveRouteSegment: rejects reversed direction by default", () => {
	const result = resolveRouteSegment(route, { source: "Damak", destination: "Kathmandu" });

	assert.equal(result.isMatch, false);
	assert.equal(result.sourceIndex, 2);
	assert.equal(result.destinationIndex, 0);
	assert.equal(result.direction, null);
});

test("resolveRouteSegment: supports reverse direction when allowReverse is enabled", () => {
	const result = resolveRouteSegment(route, {
		source: "Damak",
		destination: "Kathmandu",
		allowReverse: true,
	});

	assert.equal(result.isMatch, true);
	assert.equal(result.direction, "reverse");
	assert.deepEqual(result.path, ["Kakarvita", "Birtamode", "Damak", "Kalanki", "Kathmandu"]);
	assert.equal(result.sourceIndex, 2);
	assert.equal(result.destinationIndex, 4);
});

test("resolveRouteSegment: supports partial queries with only source or destination", () => {
	const sourceOnly = resolveRouteSegment(route, { source: "Kalanki" });
	const destinationOnly = resolveRouteSegment(route, { destination: "Birtamode" });
	const missingSource = resolveRouteSegment(route, { source: "Pokhara" });

	assert.equal(sourceOnly.isMatch, true);
	assert.equal(destinationOnly.isMatch, true);
	assert.equal(missingSource.isMatch, false);
});

test("resolveRouteSegment: matches Kakarvita/Kakarvitta/Kakarbhitta variants in both directions", () => {
	const reverse = resolveRouteSegment(routeWithVariantSpelling, {
		source: "kakarvita",
		destination: "kathmandu",
		allowReverse: true,
	});

	const forward = resolveRouteSegment(routeWithVariantSpelling, {
		source: "kathmandu",
		destination: "kakarbhitta",
		allowReverse: true,
	});

	assert.equal(reverse.isMatch, true);
	assert.equal(reverse.direction, "reverse");
	assert.equal(forward.isMatch, true);
	assert.equal(forward.direction, "forward");
});

test("resolveRouteSegment: matches values that include district suffix labels", () => {
	const reverse = resolveRouteSegment(route, {
		source: "Damak, Jhapa",
		destination: "Kathmandu, Kathmandu",
		allowReverse: true,
	});

	const forward = resolveRouteSegment(route, {
		source: "Kathmandu, Kathmandu",
		destination: "Damak, Jhapa",
		allowReverse: true,
	});

	assert.equal(reverse.isMatch, true);
	assert.equal(reverse.direction, "reverse");
	assert.equal(forward.isMatch, true);
	assert.equal(forward.direction, "forward");
});
