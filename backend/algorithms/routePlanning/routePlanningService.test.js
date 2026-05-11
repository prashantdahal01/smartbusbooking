const test = require("node:test");
const assert = require("node:assert/strict");

const { Route } = require("../../modules/route/route.model");
const districtDataService = require("../../services/districtData.service");
const { routePlanningService } = require("./index");

const originalRouteFind = Route.find;
const originalResolveDistrictNameForPlace = districtDataService.resolveDistrictNameForPlace;

let mockRoutes = [];
let districtLookupByPlace = {};

const normalizeKey = (value) => String(value || "").trim().toLowerCase();

const setDistrictLookup = (value) => {
	districtLookupByPlace = Object.entries(value || {}).reduce((acc, [place, district]) => {
		acc[normalizeKey(place)] = district;
		return acc;
	}, {});
};

test.before(() => {
	Route.find = () => ({
		select: () => ({
			lean: async () => mockRoutes,
		}),
	});

	districtDataService.resolveDistrictNameForPlace = async (place) =>
		districtLookupByPlace[normalizeKey(place)] || null;
});

test.after(() => {
	Route.find = originalRouteFind;
	districtDataService.resolveDistrictNameForPlace = originalResolveDistrictNameForPlace;
});

test.beforeEach(() => {
	mockRoutes = [];
	setDistrictLookup({});
});

test("routePlanningService.getRoutePlan: returns shortest district route response", async () => {
	setDistrictLookup({
		kalanki: "Kathmandu",
		damak: "Jhapa",
	});

	mockRoutes = [
		{ sourceDistrict: "Kathmandu", destinationDistrict: "Hetauda", distance: 132 },
		{ sourceDistrict: "Hetauda", destinationDistrict: "Birgunj", distance: 90 },
		{ sourceDistrict: "Birgunj", destinationDistrict: "Jhapa", distance: 250 },
		{ sourceDistrict: "Kathmandu", destinationDistrict: "Jhapa", distance: 600 },
	];

	const result = await routePlanningService.getRoutePlan({ source: "Kalanki", destination: "Damak" });

	assert.equal(result.source, "Kalanki");
	assert.equal(result.destination, "Damak");
	assert.equal(result.sourceDistrict, "Kathmandu");
	assert.equal(result.destinationDistrict, "Jhapa");
	assert.equal(result.distance, 472);
	assert.deepEqual(result.path, ["Kathmandu", "Hetauda", "Birgunj", "Jhapa"]);
	assert.deepEqual(result.pathKeys, ["kathmandu", "hetauda", "birgunj", "jhapa"]);
	assert.equal(result.visualization.totalDistance, 472);
	assert.equal(result.visualization.unit, "km");
	assert.equal(result.found, true);
	assert.equal(result.graphSource, "database");
	assert.equal(result.message, null);
});

test("routePlanningService.getRoutePlan: handles unresolved source/destination districts", async () => {
	setDistrictLookup({
		kalanki: "Kathmandu",
	});

	mockRoutes = [
		{ sourceDistrict: "Kathmandu", destinationDistrict: "Hetauda", distance: 132 },
	];

	const result = await routePlanningService.getRoutePlan({ source: "Kalanki", destination: "Unknown" });

	assert.equal(result.found, false);
	assert.equal(result.distance, null);
	assert.deepEqual(result.path, []);
	assert.equal(result.sourceDistrict, "Kathmandu");
	assert.equal(result.destinationDistrict, null);
	assert.equal(result.message, "Could not resolve district for source or destination");
});

test("routePlanningService.getRoutePlan: handles no-path scenario", async () => {
	setDistrictLookup({
		kalanki: "Kathmandu",
		damak: "Jhapa",
	});

	mockRoutes = [
		{ sourceDistrict: "Kathmandu", destinationDistrict: "Hetauda", distance: 132 },
		{ sourceDistrict: "Birgunj", destinationDistrict: "Jhapa", distance: 250 },
	];

	const result = await routePlanningService.getRoutePlan({ source: "Kalanki", destination: "Damak" });

	assert.equal(result.found, false);
	assert.equal(result.distance, null);
	assert.deepEqual(result.path, []);
	assert.deepEqual(result.pathKeys, []);
	assert.equal(result.graphSource, "database");
	assert.equal(result.message, "No route path exists between the requested districts");
});

test("routePlanningService.getRoutePlan: throws validation error for strict mode", async () => {
	await assert.rejects(
		() => routePlanningService.getRoutePlan({ source: "", destination: "Damak", requireBoth: true }),
		(error) => {
			assert.equal(error.statusCode, 400);
			assert.equal(error.message, "source and destination are required");
			return true;
		}
	);
});

test("routePlanningService.getRoutePlan: returns message object for non-strict mode", async () => {
	const result = await routePlanningService.getRoutePlan({ source: "", destination: "Damak", requireBoth: false });

	assert.equal(result.found, false);
	assert.equal(result.message, "source and destination are required");
	assert.equal(result.distance, null);
	assert.equal(result.source, "");
	assert.equal(result.destination, "Damak");
});