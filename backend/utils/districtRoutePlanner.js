const keyOf = (s) => String(s || "").trim().toLowerCase();

// Minimal adjacency graph for Nepal-style examples.
// You can extend this as your dataset grows.
const DEFAULT_DISTRICT_GRAPH = {
	kathmandu: ["bhaktapur", "lalitpur", "chitwan"],
	bhaktapur: ["kathmandu", "kavre"],
	kavre: ["bhaktapur", "sindhuli"],
	sindhuli: ["kavre", "sunsari", "chitwan"],
	sunsari: ["sindhuli", "morang"],
	morang: ["sunsari", "jhapa"],
	jhapa: ["morang"],
	chitwan: ["kathmandu", "sindhuli", "pokhara"],
	pokhara: ["chitwan"],
	lalitpur: ["kathmandu"],
};

const shortestDistrictPath = ({ fromDistrict, toDistrict, graph = DEFAULT_DISTRICT_GRAPH }) => {
	const fromKey = keyOf(fromDistrict);
	const toKey = keyOf(toDistrict);
	if (!fromKey || !toKey) return null;
	if (fromKey === toKey) return [String(fromDistrict).trim()];

	const queue = [fromKey];
	const prev = new Map();
	prev.set(fromKey, null);

	while (queue.length > 0) {
		const cur = queue.shift();
		const neighbors = Array.isArray(graph[cur]) ? graph[cur] : [];
		for (const n of neighbors) {
			const nk = keyOf(n);
			if (!nk || prev.has(nk)) continue;
			prev.set(nk, cur);
			if (nk === toKey) {
				queue.length = 0;
				break;
			}
			queue.push(nk);
		}
	}

	if (!prev.has(toKey)) return null;

	const rev = [];
	let cur = toKey;
	while (cur) {
		rev.push(cur);
		cur = prev.get(cur);
	}
	rev.reverse();
	return rev;
};

module.exports = { DEFAULT_DISTRICT_GRAPH, shortestDistrictPath, keyOf };
