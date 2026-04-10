// Public-facing route APIs (admin mutations live under /api/admin as well).
const Route = require("../models/Route");

const normalizeStringList = (v) => {
	if (v === undefined) return undefined;
	if (!Array.isArray(v)) return null;
	const seen = new Set();
	const out = [];
	for (const x of v) {
		const s = String(x || "").trim();
		if (!s) continue;
		const k = s.toLowerCase();
		if (seen.has(k)) continue;
		seen.add(k);
		out.push(s);
	}
	return out;
};

exports.listRoutes = async (req, res) => {
	try {
		const routes = await Route.find({}).sort({ source: 1, destination: 1 });
		return res.json(routes);
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};

exports.createRoute = async (req, res) => {
	try {
		const body = { ...req.body };
		const source = String(body.from || body.source || "").trim();
		const destination = String(body.to || body.destination || "").trim();
		const distance = body.distance !== undefined && body.distance !== null && body.distance !== "" ? Number(body.distance) : undefined;

		if (!source || !destination) return res.status(400).json({ message: "from/to (or source/destination) are required" });
		if (!Number.isFinite(distance) || distance <= 0) return res.status(400).json({ message: "distance must be a positive number" });

		const districtsCovered = normalizeStringList(body.districtsCovered);
		if (districtsCovered === null) return res.status(400).json({ message: "districtsCovered must be an array of strings" });

		const route = await Route.create({
			source,
			destination,
			distance,
			districtsCovered: districtsCovered || [],
			stops: Array.isArray(body.stops) ? body.stops : [],
		});
		return res.status(201).json(route);
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};
