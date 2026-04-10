const District = require("../models/District");

const normalizeKey = (s) => String(s || "").trim().toLowerCase();

// Fallback dataset used only when the District collection is empty.
// This keeps the stop auto-generation + admin UI usable out-of-the-box in dev.
// Once you insert District documents in MongoDB, those will be used instead.
const FALLBACK_DISTRICTS = [
	{ name: "Kathmandu", cities: ["Kalanki", "Koteshwor", "Gongabu"] },
	{ name: "Bhaktapur", cities: ["Suryabinayak", "Thimi"] },
	{ name: "Kavre", cities: ["Banepa", "Dhulikhel"] },
	{ name: "Sindhuli", cities: ["Bardibas", "Sindhulimadi"] },
	{ name: "Sunsari", cities: ["Itahari", "Dharan"] },
	{ name: "Morang", cities: ["Biratchowk", "Belbari", "Laxminagar", "Pathari", "Urlabari"] },
	{ name: "Jhapa", cities: ["Damak", "Birtamod", "Kakarvitta"] },
	{ name: "Chitwan", cities: ["Narayangadh", "Sauraha"] },
	{ name: "Pokhara", cities: ["Prithvi Chowk", "Lakeside"] },
];

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache = {
	expiresAt: 0,
	districts: [],
	districtsByKey: new Map(),
	cityToDistrictKey: new Map(),
};

const rebuildIndex = (districts) => {
	const districtsByKey = new Map();
	const cityToDistrictKey = new Map();

	(districts || []).forEach((d) => {
		const name = String(d?.name || "").trim();
		const dk = normalizeKey(name);
		if (!dk) return;
		districtsByKey.set(dk, { ...d, name });

		(Array.isArray(d?.cities) ? d.cities : []).forEach((c) => {
			const city = String(c || "").trim();
			const ck = normalizeKey(city);
			if (!ck) return;
			// If duplicates exist across districts, keep the first one.
			if (!cityToDistrictKey.has(ck)) cityToDistrictKey.set(ck, dk);
		});
	});

	return { districtsByKey, cityToDistrictKey };
};

const load = async () => {
	const now = Date.now();
	if (cache.expiresAt > now && Array.isArray(cache.districts) && cache.districts.length > 0) {
		return cache;
	}

	const districts = await District.find({}).sort({ name: 1 }).lean();
	const effectiveDistricts = districts.length > 0 ? districts : FALLBACK_DISTRICTS;
	const { districtsByKey, cityToDistrictKey } = rebuildIndex(effectiveDistricts);

	cache = {
		expiresAt: now + CACHE_TTL_MS,
		districts: effectiveDistricts,
		districtsByKey,
		cityToDistrictKey,
	};
	return cache;
};

const invalidate = () => {
	cache.expiresAt = 0;
};

const resolveDistrictNameForPlace = async (place) => {
	const placeKey = normalizeKey(place);
	if (!placeKey) return null;
	const c = await load();
	const districtKeyFromCity = c.cityToDistrictKey.get(placeKey);
	if (districtKeyFromCity) return c.districtsByKey.get(districtKeyFromCity)?.name || null;
	// Also allow passing a district name directly.
	const district = c.districtsByKey.get(placeKey);
	return district?.name || null;
};

module.exports = {
	normalizeKey,
	getDistrictsCached: async () => (await load()).districts,
	getDistrictIndexCached: async () => {
		const c = await load();
		return { districtsByKey: c.districtsByKey, cityToDistrictKey: c.cityToDistrictKey };
	},
	invalidateDistrictCache: invalidate,
	resolveDistrictNameForPlace,
};
