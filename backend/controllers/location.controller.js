const City = require("../models/City");
const District = require("../models/District");
const Route = require("../models/Route");
const Stop = require("../models/Stop");

const TYPE_PRIORITY = Object.freeze({
	city: 0,
	district: 1,
	stop: 2,
});

const normalizeText = (value) => String(value || "").trim();
const normalizeKey = (value) => normalizeText(value).toLowerCase().replace(/\s+/g, " ");
const escapeRegex = (value) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toPositiveInt = (raw, fallback, min, max) => {
	const parsed = Number(raw);
	if (!Number.isFinite(parsed)) return fallback;
	const intValue = Math.trunc(parsed);
	if (intValue < min) return min;
	if (intValue > max) return max;
	return intValue;
};

const toDisplayName = (name, districtName) => {
	const safeName = normalizeText(name);
	const safeDistrict = normalizeText(districtName);
	if (!safeName) return "";
	if (!safeDistrict) return safeName;
	if (normalizeKey(safeName) === normalizeKey(safeDistrict)) return safeName;
	return `${safeName}, ${safeDistrict}`;
};

const extractStopName = (raw) => {
	if (raw === null || raw === undefined) return "";
	if (typeof raw === "string") return normalizeText(raw);
	if (typeof raw === "object") {
		return normalizeText(raw?.name || raw?.city || raw?.cityName || "");
	}
	return "";
};

const getRoutePointNames = (route) => {
	const seen = new Set();
	const out = [];

	const pushUnique = (candidate) => {
		const name = normalizeText(candidate);
		const key = normalizeKey(name);
		if (!name || !key || seen.has(key)) return;
		seen.add(key);
		out.push(name);
	};

	(Array.isArray(route?.stops) ? route.stops : []).forEach((item) => {
		pushUnique(extractStopName(item));
	});
	(Array.isArray(route?.boardingPoints) ? route.boardingPoints : []).forEach((item) => {
		pushUnique(extractStopName(item));
	});
	(Array.isArray(route?.droppingPoints) ? route.droppingPoints : []).forEach((item) => {
		pushUnique(extractStopName(item));
	});

	return out;
};

const getMatchScore = (name, queryKey) => {
	const normalizedName = normalizeKey(name);
	if (!normalizedName || !queryKey) return null;
	const index = normalizedName.indexOf(queryKey);
	if (index === -1) return null;

	const startsPenalty = index === 0 ? 0 : 100;
	return startsPenalty + (index * 10) + normalizedName.length;
};

const addSuggestion = ({ byKey, queryKey, name, type }) => {
	const safeName = normalizeText(name);
	const key = normalizeKey(safeName);
	if (!safeName || !key) return;

	const score = getMatchScore(safeName, queryKey);
	if (score === null) return;

	const typePriority = TYPE_PRIORITY[type] ?? 99;
	const existing = byKey.get(key);
	if (!existing) {
		byKey.set(key, { name: safeName, type, score, typePriority });
		return;
	}

	if (score < existing.score) {
		byKey.set(key, { name: safeName, type, score, typePriority });
		return;
	}

	if (score === existing.score && typePriority < existing.typePriority) {
		byKey.set(key, { name: safeName, type, score, typePriority });
	}
};

exports.searchLocations = async (req, res) => {
	try {
		const queryText = normalizeText(req.query?.q);
		if (!queryText) return res.json([]);

		const limit = toPositiveInt(req.query?.limit, 10, 1, 20);
		const perSourceLimit = Math.min(Math.max(limit * 4, 20), 80);
		const queryKey = normalizeKey(queryText);
		const queryRegex = new RegExp(escapeRegex(queryText), "i");

		const [districts, cities, stops, routes] = await Promise.all([
			District.find({ name: queryRegex })
				.select("name")
				.limit(perSourceLimit)
				.lean(),
			City.find({ name: queryRegex })
				.select("name district")
				.populate("district", "name")
				.limit(perSourceLimit)
				.lean(),
			Stop.find({
				$or: [
					{ cityName: queryRegex },
					{ district: queryRegex },
				],
			})
				.select("cityName district")
				.limit(perSourceLimit)
				.lean(),
			Route.find({
				$or: [
					{ source: queryRegex },
					{ destination: queryRegex },
					{ "stops.name": queryRegex },
					{ "boardingPoints.name": queryRegex },
					{ "droppingPoints.name": queryRegex },
				],
			})
				.select("source destination sourceDistrict destinationDistrict stops boardingPoints droppingPoints")
				.limit(perSourceLimit)
				.lean(),
		]);

		const byKey = new Map();

		districts.forEach((district) => {
			addSuggestion({
				byKey,
				queryKey,
				name: normalizeText(district?.name),
				type: "district",
			});
		});

		cities.forEach((city) => {
			addSuggestion({
				byKey,
				queryKey,
				name: toDisplayName(city?.name, city?.district?.name),
				type: "city",
			});
		});

		stops.forEach((stop) => {
			addSuggestion({
				byKey,
				queryKey,
				name: toDisplayName(stop?.cityName, stop?.district),
				type: "stop",
			});
		});

		routes.forEach((route) => {
			addSuggestion({
				byKey,
				queryKey,
				name: toDisplayName(route?.source, route?.sourceDistrict),
				type: "city",
			});
			addSuggestion({
				byKey,
				queryKey,
				name: toDisplayName(route?.destination, route?.destinationDistrict),
				type: "city",
			});

			getRoutePointNames(route).forEach((pointName) => {
				addSuggestion({
					byKey,
					queryKey,
					name: pointName,
					type: "stop",
				});
			});
		});

		const suggestions = Array.from(byKey.values())
			.sort((left, right) => {
				if (left.score !== right.score) return left.score - right.score;
				if (left.typePriority !== right.typePriority) return left.typePriority - right.typePriority;
				return left.name.localeCompare(right.name, undefined, { sensitivity: "base" });
			})
			.slice(0, limit)
			.map(({ name, type }) => ({ name, type }));

		return res.json(suggestions);
	} catch (error) {
		return res.status(500).json({ message: error.message });
	}
};
