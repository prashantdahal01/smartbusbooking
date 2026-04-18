const test = require("node:test");
const assert = require("node:assert/strict");
const { performance } = require("node:perf_hooks");

const { findShortestPath } = require("./dijkstraManager");

test("findShortestPath: returns weighted shortest path", () => {
	const graph = {
		a: { b: 1, c: 4 },
		b: { a: 1, c: 2, d: 5 },
		c: { a: 4, b: 2, d: 1 },
		d: { b: 5, c: 1 },
	};

	const result = findShortestPath(graph, "a", "d");
	assert.equal(result.distance, 4);
	assert.deepEqual(result.path, ["a", "b", "c", "d"]);
});

test("findShortestPath: handles invalid nodes", () => {
	const graph = {
		a: { b: 2 },
		b: { a: 2 },
	};

	const result = findShortestPath(graph, "unknown", "b");
	assert.equal(result.distance, null);
	assert.deepEqual(result.path, []);
});

test("findShortestPath: handles no-path scenario", () => {
	const graph = {
		a: { b: 3 },
		b: { a: 3 },
		c: {},
	};

	const result = findShortestPath(graph, "a", "c");
	assert.equal(result.distance, null);
	assert.deepEqual(result.path, []);
});

test(
	"findShortestPath: large graph performance sanity",
	{ timeout: 10000 },
	() => {
		const graph = {};
		const nodeCount = 2500;

		for (let i = 0; i < nodeCount; i += 1) {
			graph[`n${i}`] = {};
		}

		for (let i = 0; i < nodeCount - 1; i += 1) {
			graph[`n${i}`][`n${i + 1}`] = 1;
			graph[`n${i + 1}`][`n${i}`] = 1;
		}

		for (let i = 0; i < nodeCount - 50; i += 50) {
			graph[`n${i}`][`n${i + 50}`] = 200;
			graph[`n${i + 50}`][`n${i}`] = 200;
		}

		const startedAt = performance.now();
		const result = findShortestPath(graph, "n0", `n${nodeCount - 1}`);
		const elapsedMs = performance.now() - startedAt;

		assert.equal(result.distance, nodeCount - 1);
		assert.equal(result.path[0], "n0");
		assert.equal(result.path[result.path.length - 1], `n${nodeCount - 1}`);
		assert.equal(result.path.length, nodeCount);
		assert.ok(elapsedMs < 5000, `Expected runtime < 5000ms, received ${elapsedMs.toFixed(2)}ms`);
	}
);