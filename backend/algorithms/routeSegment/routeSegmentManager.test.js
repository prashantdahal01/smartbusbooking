const test = require("node:test");
const assert = require("node:assert/strict");

const { Route } = require("../../modules/route/route.model");
const { matchRouteSegment } = require("./routeSegmentManager");

const originalRouteExists = Route.exists;

test.after(() => {
	Route.exists = originalRouteExists;
});

test.afterEach(() => {
	Route.exists = originalRouteExists;
});

const sampleRoute = {
	_id: "route-forward",
	source: "Kathmandu",
	destination: "Kakarvitta",
	stops: [
		{ name: "Kalanki", order: 1 },
		{ name: "Damak", order: 2 },
		{ name: "Birtamode", order: 3 },
	],
	sourceDistrict: "Kathmandu",
	destinationDistrict: "Jhapa",
};

test("matchRouteSegment: matches intermediate forward segment", async () => {
	const result = await matchRouteSegment(sampleRoute, "Kathmandu", "Damak");

	assert.equal(result.isMatch, true);
	assert.equal(result.direction, "forward");
	assert.equal(result.sourceIndex, 0);
	assert.equal(result.destinationIndex, 2);
	assert.deepEqual(result.segmentPathLabels, ["Kathmandu", "Kalanki", "Damak"]);
});

test("matchRouteSegment: marks reverse request when reverse route does not exist", async () => {
	Route.exists = async () => null;

	const result = await matchRouteSegment(sampleRoute, "Damak", "Kathmandu");

	assert.equal(result.isMatch, false);
	assert.equal(result.direction, "reverse");
	assert.equal(result.reverseRouteExists, false);
	assert.equal(result.reason, "reverse_route_missing");
});

test("matchRouteSegment: marks reverse request when reverse route exists in DB", async () => {
	Route.exists = async () => ({ _id: "reverse-route" });

	const result = await matchRouteSegment(sampleRoute, "Damak", "Kathmandu");

	assert.equal(result.isMatch, false);
	assert.equal(result.direction, "reverse");
	assert.equal(result.reverseRouteExists, true);
	assert.equal(result.reason, "reverse_route_required");
});

test("matchRouteSegment: supports partial source-only matching when enabled", async () => {
	const result = await matchRouteSegment(sampleRoute, "Damak", "", { allowPartial: true });

	assert.equal(result.isMatch, true);
	assert.equal(result.direction, "forward");
	assert.equal(result.sourceIndex, 2);
	assert.equal(result.destinationIndex, null);
	assert.deepEqual(result.segmentPathLabels, ["Damak", "Birtamode", "Kakarvitta"]);
});