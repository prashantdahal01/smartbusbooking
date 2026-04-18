const { normalizeNodeKey } = require("./graphBuilder");

const getAllNodeKeys = (graph) => {
	const keys = new Set();

	for (const [nodeKey, neighbors] of Object.entries(graph || {})) {
		const normalizedNode = normalizeNodeKey(nodeKey);
		if (normalizedNode) keys.add(normalizedNode);

		for (const neighborKey of Object.keys(neighbors || {})) {
			const normalizedNeighbor = normalizeNodeKey(neighborKey);
			if (normalizedNeighbor) keys.add(normalizedNeighbor);
		}
	}

	return keys;
};

class MinHeap {
	constructor() {
		this.items = [];
	}

	isEmpty() {
		return this.items.length === 0;
	}

	push(node) {
		this.items.push(node);
		this.heapifyUp(this.items.length - 1);
	}

	pop() {
		if (this.items.length === 0) return null;
		if (this.items.length === 1) return this.items.pop();

		const min = this.items[0];
		this.items[0] = this.items.pop();
		this.heapifyDown(0);
		return min;
	}

	heapifyUp(startIndex) {
		let index = startIndex;
		while (index > 0) {
			const parentIndex = Math.floor((index - 1) / 2);
			if (this.items[parentIndex].distance <= this.items[index].distance) break;
			[this.items[parentIndex], this.items[index]] = [this.items[index], this.items[parentIndex]];
			index = parentIndex;
		}
	}

	heapifyDown(startIndex) {
		let index = startIndex;
		const { items } = this;

		while (true) {
			const left = index * 2 + 1;
			const right = index * 2 + 2;
			let smallest = index;

			if (left < items.length && items[left].distance < items[smallest].distance) {
				smallest = left;
			}
			if (right < items.length && items[right].distance < items[smallest].distance) {
				smallest = right;
			}
			if (smallest === index) break;

			[items[index], items[smallest]] = [items[smallest], items[index]];
			index = smallest;
		}
	}
}

const reconstructPath = (previous, endKey) => {
	const reversedPath = [];
	let cursor = endKey;

	while (cursor) {
		reversedPath.push(cursor);
		cursor = previous[cursor] || null;
	}

	reversedPath.reverse();
	return reversedPath;
};

const findShortestPath = (graph, start, end) => {
	const startKey = normalizeNodeKey(start);
	const endKey = normalizeNodeKey(end);
	const nodeKeys = getAllNodeKeys(graph);

	if (!startKey || !endKey) {
		return { distance: null, path: [] };
	}

	if (!nodeKeys.has(startKey) || !nodeKeys.has(endKey)) {
		return { distance: null, path: [] };
	}

	if (startKey === endKey) {
		return { distance: 0, path: [startKey] };
	}

	const distances = {};
	const previous = {};
	const visited = new Set();
	const minHeap = new MinHeap();

	for (const nodeKey of nodeKeys) {
		distances[nodeKey] = Infinity;
		previous[nodeKey] = null;
	}
	distances[startKey] = 0;
	minHeap.push({ nodeKey: startKey, distance: 0 });

	while (!minHeap.isEmpty()) {
		const current = minHeap.pop();
		if (!current) break;

		const currentNode = current.nodeKey;
		const smallestDistance = current.distance;

		if (!currentNode || !Number.isFinite(smallestDistance)) break;

		if (smallestDistance > distances[currentNode]) continue;
		if (visited.has(currentNode)) continue;

		if (currentNode === endKey) {
			break;
		}

		visited.add(currentNode);

		const neighbors = graph?.[currentNode] || {};
		for (const [neighborNode, rawWeight] of Object.entries(neighbors)) {
			const neighborKey = normalizeNodeKey(neighborNode);
			if (!neighborKey || visited.has(neighborKey)) continue;

			const edgeWeight = Number(rawWeight);
			if (!Number.isFinite(edgeWeight) || edgeWeight <= 0) continue;

			const newDistance = smallestDistance + edgeWeight;
			if (newDistance < distances[neighborKey]) {
				distances[neighborKey] = newDistance;
				previous[neighborKey] = currentNode;
				minHeap.push({ nodeKey: neighborKey, distance: newDistance });
			}
		}
	}

	if (!Number.isFinite(distances[endKey])) {
		return { distance: null, path: [] };
	}

	return {
		distance: distances[endKey],
		path: reconstructPath(previous, endKey),
	};
};

module.exports = {
	findShortestPath,
};