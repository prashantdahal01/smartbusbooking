const test = require("node:test");
const assert = require("node:assert/strict");

const Route = require("../../models/Route");
const { routeSegmentService } = require("./routeSegmentService");

const originalRouteExists = Route.exists;

test.after(() => {
	Route.exists = originalRouteExists;
});

test.afterEach(() => {
	Route.exists = originalRouteExists;
});

const makeSchedule = (id, route, date = "2026-01-10") => ({
	_id: id,
	date,
	route,
	bus: { _id: `bus-${id}` },
});

const routeA = {
	_id: "route-a",
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

const routeB = {
	_id: "route-b",
	source: "Pokhara",
	destination: "Butwal",
	stops: [{ name: "Waling", order: 1 }],
	sourceDistrict: "Kaski",
	destinationDistrict: "Rupandehi",
};

test("routeSegmentService.filterSchedulesBySegment: returns only schedules matching forward segment", async () => {
	Route.exists = async () => null;

	const schedules = [
		makeSchedule("sch-a", routeA),
		makeSchedule("sch-b", routeB),
	];

	const results = await routeSegmentService.filterSchedulesBySegment(
		schedules,
		"Kathmandu",
		"Damak",
		{ requireBoth: false, allowPartial: true }
	);

	assert.equal(results.length, 1);
	assert.equal(results[0]._id, "sch-a");
	assert.equal(results[0].searchSegment.source, "Kathmandu");
	assert.equal(results[0].searchSegment.destination, "Damak");
	assert.equal(results[0].searchSegment.direction, "forward");
	assert.deepEqual(results[0].segmentPath, ["Kathmandu", "Kalanki", "Damak"]);
});

test("routeSegmentService.filterSchedulesBySegment: maps validation error with status 400", async () => {
	await assert.rejects(
		() => routeSegmentService.filterSchedulesBySegment([], "Damak", "Damak", { requireBoth: false }),
		(error) => {
			assert.equal(routeSegmentService.isRouteSegmentError(error), true);
			assert.equal(error.statusCode, 400);
			assert.equal(error.message, "source and destination cannot be the same");
			return true;
		}
	);
});

test("routeSegmentService.buildSearchOptions: creates only forward unique pairs", () => {
	const schedules = [
		makeSchedule("sch-a-1", routeA),
		makeSchedule("sch-a-2", routeA),
	];

	const options = routeSegmentService.buildSearchOptions(schedules);
	const pairs = options.pairs;

	assert.ok(pairs.some((pair) => pair.source === "Kathmandu" && pair.destination === "Damak"));
	assert.ok(pairs.some((pair) => pair.source === "Kalanki" && pair.destination === "Birtamode"));
	assert.equal(pairs.some((pair) => pair.source === "Damak" && pair.destination === "Kathmandu"), false);

	const uniquePairKeys = new Set(pairs.map((pair) => `${pair.source.toLowerCase()}|||${pair.destination.toLowerCase()}`));
	assert.equal(uniquePairKeys.size, pairs.length);
});