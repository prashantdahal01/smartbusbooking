const test = require("node:test");
const assert = require("node:assert/strict");

const { buildDistrictGraph, buildDistrictGraphWithMeta } = require("./graphBuilder");

test("buildDistrictGraphWithMeta: prefers database distances when valid routes exist", () => {
	const routes = [
		{ sourceDistrict: "Kathmandu", destinationDistrict: "Hetauda", distance: 132 },
		{ sourceDistrict: "Hetauda", destinationDistrict: "Birgunj", distance: 90 },
		{ sourceDistrict: "Kathmandu", destinationDistrict: "Hetauda", distance: 140 },
		{ sourceDistrict: "Kathmandu", destinationDistrict: "Pokhara", distance: "invalid" },
	];

	const { graph, graphSource } = buildDistrictGraphWithMeta(routes);

	assert.equal(graphSource, "database");
	assert.equal(graph.kathmandu.hetauda, 132);
	assert.equal(graph.hetauda.kathmandu, 132);
	assert.equal(graph.hetauda.birgunj, 90);
	assert.equal(graph.birgunj.hetauda, 90);
	assert.equal(graph.kathmandu.pokhara, undefined);
});

test("buildDistrictGraphWithMeta: falls back when no valid DB edges exist", () => {
	const routes = [
		{ sourceDistrict: "Kathmandu", destinationDistrict: "Pokhara", distance: null },
		{ sourceDistrict: "Pokhara", destinationDistrict: "Chitwan", distance: -5 },
	];

	const { graph, graphSource } = buildDistrictGraphWithMeta(routes);

	assert.equal(graphSource, "fallback");
	assert.equal(typeof graph.kathmandu, "object");
	assert.equal(graph.kathmandu.chitwan, 150);
});

test("buildDistrictGraph: uses fallback graph only when needed", () => {
	const fromDb = buildDistrictGraph([
		{ sourceDistrict: "Sindhuli", destinationDistrict: "Sunsari", distance: 170 },
	]);
	assert.equal(fromDb.sindhuli.sunsari, 170);
	assert.equal(fromDb.sunsari.sindhuli, 170);

	const fallback = buildDistrictGraph([]);
	assert.equal(fallback.kathmandu.bhaktapur, 16);
});