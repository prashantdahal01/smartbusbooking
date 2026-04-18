// Admin page for managing schedules/trips with detailed trip metadata
import { useEffect, useMemo, useRef, useState } from "react";
import {
	createSchedule,
	deleteSchedule,
	getBuses,
	getRouteStops,
	getRoutes,
	getSchedules,
	updateSchedule,
} from "../../services/admin.service";
import { getBusTypeSummary } from "../../utils/busTypeUtils";
import { formatCurrency } from "../../utils/helpers";

const stopKey = (s) => String(s || "").trim().toLowerCase();

const normalizeStopType = (value) => {
	const type = String(value || "pickup").trim().toLowerCase();
	if (type === "drop") return "drop";
	if (type === "both") return "both";
	return "pickup";
};

const stopTypeAllowsBoarding = (value) => {
	const type = normalizeStopType(value);
	return type === "pickup" || type === "both";
};

const stopTypeAllowsDropping = (value) => {
	const type = normalizeStopType(value);
	return type === "drop" || type === "both";
};

const toStopName = (raw) => {
	if (raw === null || raw === undefined) return "";
	if (typeof raw === "string") return raw;
	if (typeof raw === "object") return raw.name;
	return "";
};

const toStopKmFromSource = (raw) => {
	if (!raw || typeof raw !== "object") return undefined;
	if (raw.kmFromSource !== undefined) return raw.kmFromSource;
	if (raw.distanceFromSourceKm !== undefined) return raw.distanceFromSourceKm;
	if (raw.km !== undefined) return raw.km;
	return undefined;
};

const parseIsoDateTimeMs = (date, time) => {
	const d = String(date || "").trim();
	const t = String(time || "").trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(t)) return NaN;
	return new Date(`${d}T${t}:00`).getTime();
};

const pad2 = (n) => String(n).padStart(2, "0");

const formatLocalDate = (ms) => {
	const d = new Date(ms);
	return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const formatLocalTime = (ms) => {
	const d = new Date(ms);
	return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

const FEATURE_OPTIONS = [
	{ key: "women_traveling", label: "Women traveling" },
	{ key: "free_date_change", label: "Free date change" },
	{ key: "exclusive_deals", label: "Exclusive deals" },
	{ key: "flexi_ticket", label: "Flexi ticket" },
];

const BASE_AMENITY_OPTIONS = [
	"WiFi",
	"AC",
	"Charging Port",
	"Water Bottle",
	"Snacks",
	"Blanket",
	"TV",
	"Recliner Seats",
];

const normalizeStringList = (items) => {
	const raw = (Array.isArray(items) ? items : [])
		.map((s) => String(s || "").trim())
		.filter(Boolean);
	return [...new Set(raw)];
};

const getScheduleFareSummary = (schedule) => {
	const legacyPrice = Number(schedule?.price);
	if (Number.isFinite(legacyPrice) && legacyPrice >= 0) return formatCurrency(legacyPrice);

	const prices = (Array.isArray(schedule?.bus?.decks) ? schedule.bus.decks : [])
		.flatMap((deck) => (Array.isArray(deck?.seats) ? deck.seats : []))
		.map((seat) => Number(seat?.price))
		.filter((price) => Number.isFinite(price) && price >= 0);

	if (prices.length === 0) return "Defined in bus layout";

	const min = Math.min(...prices);
	const max = Math.max(...prices);
	if (min === max) return formatCurrency(min);
	return `${formatCurrency(min)} - ${formatCurrency(max)}`;
};

const pointIdentity = (point) => {
	const stopId = String(point?.stopId || "").trim();
	if (stopId) return `id:${stopId}`;
	return `name:${stopKey(point?.name)}`;
};

const sanitizePoints = (points) => {
	const arr = Array.isArray(points) ? points : [];
	const seen = new Set();
	const out = [];
	arr.forEach((p) => {
		const name = String(p?.name || "").trim();
		const stopId = String(p?.stopId || "").trim();
		const rawOrder = Number(p?.order);
		const order = Number.isFinite(rawOrder) && rawOrder > 0 ? Math.trunc(rawOrder) : undefined;
		if (!name && !stopId) return;
		const k = pointIdentity({ name, stopId });
		if (seen.has(k)) return;
		seen.add(k);
		out.push({
			stopId,
			name,
			time: String(p?.time || "").trim(),
			date: String(p?.date || "").trim(),
			...(Number.isFinite(order) ? { order } : {}),
			_auto: Boolean(p?._auto),
		});
	});
	return out;
};

const toggleValue = (list, value) => {
	const v = String(value || "").trim();
	if (!v) return list;
	return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
};

const formatTemplateTimeLabel = (template) => {
	if (!template) return "";
	if (template.absoluteTime) return `Time ${template.absoluteTime}`;
	if (template.offsetMinutes !== null && template.offsetMinutes !== undefined && template.offsetMinutes !== "") {
		return `T+${template.offsetMinutes} min`;
	}
	return "";
};

const groupStopOptionsByDistrict = (options) => {
	const map = new Map();
	options.forEach((option) => {
		const district = String(option?.district || "Other").trim() || "Other";
		if (!map.has(district)) map.set(district, []);
		map.get(district).push(option);
	});

	return Array.from(map.entries())
		.map(([district, stops]) => ({
			district,
			stops: [...stops].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name)),
		}))
		.sort((a, b) => a.district.localeCompare(b.district));
};

const togglePointByStop = (points, stopOption, defaults = {}) => {
	const stopId = String(stopOption?.stopId || "").trim();
	const name = String(stopOption?.name || "").trim();
	if (!stopId && !name) return points;

	const key = pointIdentity({ stopId, name });
	const exists = points.some((p) => pointIdentity(p) === key);
	if (exists) return points.filter((p) => pointIdentity(p) !== key);

	const nextDate = String(defaults?.date || "").trim();
	const nextTime = String(defaults?.time || "").trim();
	const isAuto = Boolean(defaults?._auto);

	return [
		...points,
		{
			stopId,
			name,
			time: nextTime,
			date: nextDate,
			order: Number.isFinite(Number(stopOption?.order)) && Number(stopOption.order) > 0
				? Math.trunc(Number(stopOption.order))
				: undefined,
			_auto: isAuto,
		},
	];
};

export default function ManageSchedules() {
	const [buses, setBuses] = useState([]);
	const [routes, setRoutes] = useState([]);
	const [schedules, setSchedules] = useState([]);
	const [loading, setLoading] = useState(true);
	const [actionLoading, setActionLoading] = useState(false);
	const [error, setError] = useState("");

	const [editingId, setEditingId] = useState(null);
	const isEditing = useMemo(() => Boolean(editingId), [editingId]);

	// form fields
	const [busId, setBusId] = useState("");
	const [routeId, setRouteId] = useState("");
	const [date, setDate] = useState("");
	const [time, setTime] = useState("");
	const [arrivalDate, setArrivalDate] = useState("");
	const [arrivalTime, setArrivalTime] = useState("");
	const [durationHours, setDurationHours] = useState("");
	const [refundable, setRefundable] = useState(false);
	const [features, setFeatures] = useState([]);
	const [amenities, setAmenities] = useState([]);

	const [refundPolicy, setRefundPolicy] = useState("");
	const [cancellationPolicy, setCancellationPolicy] = useState("");
	const [dateChangePolicy, setDateChangePolicy] = useState("");
	const [luggagePolicy, setLuggagePolicy] = useState("");
	const [boardingPoints, setBoardingPoints] = useState([]);
	const [droppingPoints, setDroppingPoints] = useState([]);
	const [routeStopDocs, setRouteStopDocs] = useState([]);

	const selectedRoute = useMemo(() => routes.find((r) => r._id === routeId) || null, [routes, routeId]);
	const selectedBus = useMemo(() => buses.find((b) => String(b?._id) === String(busId)) || null, [buses, busId]);
	const selectedBusHasPolicies = useMemo(() => {
		if (!selectedBus) return false;
		const policies = selectedBus?.policies || {};
		return [
			policies?.refundPolicy,
			policies?.cancellationPolicy,
			policies?.dateChangePolicy,
			policies?.luggagePolicy,
		].some((value) => String(value || "").trim());
	}, [selectedBus]);
	const showBusPolicyLoadedHint = !isEditing && Boolean(selectedBus);
	const prevRouteIdRef = useRef("");

	useEffect(() => {
		let cancelled = false;
		if (!routeId) {
			setRouteStopDocs([]);
			prevRouteIdRef.current = "";
			return () => {};
		}

		// If the admin switches routes while creating, clear points to avoid mismatches.
		if (!isEditing && prevRouteIdRef.current && prevRouteIdRef.current !== routeId) {
			setBoardingPoints([]);
			setDroppingPoints([]);
		}
		prevRouteIdRef.current = routeId;

		getRouteStops(routeId)
			.then((data) => {
				if (cancelled) return;
				setRouteStopDocs(Array.isArray(data) ? data : []);
			})
			.catch(() => {
				if (cancelled) return;
				setRouteStopDocs([]);
			});

		return () => {
			cancelled = true;
		};
	}, [routeId, isEditing]);
	const routeStopEntries = useMemo(() => {
		const rows = (Array.isArray(routeStopDocs) ? routeStopDocs : [])
			.map((doc, index) => {
				const name = String(doc?.cityName || doc?.cityRef?.name || doc?.city || "").trim();
				const cityKey = stopKey(doc?.cityKey || name);
				if (!name || !cityKey) return null;

				const orderRaw = Number(doc?.order);
				const order = Number.isFinite(orderRaw) && Number.isInteger(orderRaw) && orderRaw > 0 ? orderRaw : index + 1;

				const offsetRaw = doc?.offsetMinutes;
				const offsetMinutes =
					offsetRaw !== undefined && offsetRaw !== null && offsetRaw !== "" && Number.isFinite(Number(offsetRaw))
						? Number(offsetRaw)
						: null;

				return {
					stopId: String(doc?._id || "").trim(),
					name,
					cityKey,
					district: String(doc?.district || doc?.districtName || "Other").trim() || "Other",
					type: normalizeStopType(doc?.type),
					order,
					absoluteTime: String(doc?.absoluteTime || "").trim(),
					offsetMinutes,
				};
			})
			.filter(Boolean)
			.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

		return rows;
	}, [routeStopDocs]);

	const boardingPointOptions = useMemo(
		() => routeStopEntries.filter((entry) => stopTypeAllowsBoarding(entry.type)),
		[routeStopEntries]
	);

	const droppingPointOptions = useMemo(
		() => routeStopEntries.filter((entry) => stopTypeAllowsDropping(entry.type)),
		[routeStopEntries]
	);

	const groupedBoardingPointOptions = useMemo(
		() => groupStopOptionsByDistrict(boardingPointOptions),
		[boardingPointOptions]
	);

	const groupedDroppingPointOptions = useMemo(
		() => groupStopOptionsByDistrict(droppingPointOptions),
		[droppingPointOptions]
	);

	const boardingOptionByIdentity = useMemo(() => {
		const map = new Map();
		boardingPointOptions.forEach((option) => {
			map.set(pointIdentity(option), option);
			map.set(`name:${option.cityKey}`, option);
		});
		return map;
	}, [boardingPointOptions]);

	const droppingOptionByIdentity = useMemo(() => {
		const map = new Map();
		droppingPointOptions.forEach((option) => {
			map.set(pointIdentity(option), option);
			map.set(`name:${option.cityKey}`, option);
		});
		return map;
	}, [droppingPointOptions]);

	const stopKmByKey = useMemo(() => {
		const map = new Map();
		if (!selectedRoute) return map;

		const totalKm = Number(selectedRoute.distance);
		if (!Number.isFinite(totalKm) || totalKm <= 0) return map;

		const routeStops = Array.isArray(selectedRoute.stops) ? selectedRoute.stops : [];
		routeStops.forEach((raw) => {
			const name = String(toStopName(raw) || "").trim();
			if (!name) return;
			const key = stopKey(name);
			if (!key) return;
			const kmRaw = toStopKmFromSource(raw);
			const km = kmRaw !== undefined && kmRaw !== null && kmRaw !== "" ? Number(kmRaw) : NaN;
			if (!Number.isFinite(km)) return;
			map.set(key, Math.max(0, Math.min(totalKm, km)));
		});

		return map;
	}, [selectedRoute]);

	const departureMs = useMemo(() => parseIsoDateTimeMs(date, time), [date, time]);
	const arrivalMs = useMemo(() => {
		if (!Number.isFinite(departureMs)) return NaN;

		const aDateRaw = String(arrivalDate || "").trim();
		const aTimeRaw = String(arrivalTime || "").trim();
		if (aTimeRaw) {
			const baseDate = aDateRaw || String(date || "").trim();
			const ms = parseIsoDateTimeMs(baseDate, aTimeRaw);
			if (Number.isFinite(ms)) {
				// If date wasn't provided and time looks "earlier", assume next day.
				if (!aDateRaw && ms <= departureMs) return ms + 24 * 60 * 60 * 1000;
				return ms;
			}
		}

		if (durationHours !== "") {
			const hours = Number(durationHours);
			if (Number.isFinite(hours) && hours > 0) return departureMs + Math.round(hours * 60) * 60 * 1000;
		}

		return NaN;
	}, [arrivalDate, arrivalTime, date, departureMs, durationHours]);

	const autoPointByKey = useMemo(() => {
		const map = new Map();
		if (!Number.isFinite(departureMs)) return map;

		const baseDate = String(date || "").trim();
		if (!baseDate || routeStopEntries.length === 0) return map;

		const isValidHHmm = (s) => /^\d{2}:\d{2}$/.test(String(s || "").trim());

		routeStopEntries.forEach((entry) => {
			const key = pointIdentity({ stopId: entry.stopId, name: entry.name });
			const abs = String(entry?.absoluteTime || "").trim();
			if (abs && isValidHHmm(abs)) {
				const parsed = parseIsoDateTimeMs(baseDate, abs);
				if (!Number.isFinite(parsed)) return;
				let ms = parsed;
				while (ms < departureMs) ms += 24 * 60 * 60 * 1000;
				map.set(key, { date: formatLocalDate(ms), time: formatLocalTime(ms) });
				return;
			}

			const offset = Number(entry?.offsetMinutes);
			if (!Number.isFinite(offset) || offset < 0) return;
			const ms = departureMs + Math.round(offset) * 60 * 1000;
			map.set(key, { date: formatLocalDate(ms), time: formatLocalTime(ms) });
		});

		if (Number.isFinite(arrivalMs) && arrivalMs > departureMs) {
			const totalKm = Number(selectedRoute.distance);
			if (Number.isFinite(totalKm) && totalKm > 0) {
				routeStopEntries.forEach((entry) => {
					const key = pointIdentity({ stopId: entry.stopId, name: entry.name });
					if (map.has(key)) return;
					const km = stopKmByKey.get(entry.cityKey);
					if (!Number.isFinite(km)) return;
					const frac = totalKm > 0 ? km / totalKm : 0;
					const ms = departureMs + Math.round(frac * (arrivalMs - departureMs));
					map.set(key, { date: formatLocalDate(ms), time: formatLocalTime(ms) });
				});
			}
		}

		return map;
	}, [arrivalMs, date, departureMs, routeStopEntries, selectedRoute, stopKmByKey]);

	const stopIndexByKey = useMemo(() => {
		const map = new Map();
		routeStopEntries.forEach((entry, idx) => {
			const idKey = pointIdentity({ stopId: entry.stopId, name: entry.name });
			if (!map.has(idKey)) map.set(idKey, idx);
			const nameKey = `name:${entry.cityKey}`;
			if (!map.has(nameKey)) map.set(nameKey, idx);
		});
		return map;
	}, [routeStopEntries]);

	const pointSortIndex = (point) => {
		const identity = pointIdentity(point);
		if (stopIndexByKey.has(identity)) return stopIndexByKey.get(identity);
		return stopIndexByKey.get(`name:${stopKey(point?.name)}`) ?? Number.POSITIVE_INFINITY;
	};

	useEffect(() => {
		if (!routeStopEntries.length) return;

		const withMappedStopIds = (prev) =>
			(Array.isArray(prev) ? prev : []).map((point) => {
				const existingId = String(point?.stopId || "").trim();
				if (existingId && routeStopEntries.some((entry) => String(entry.stopId) === existingId)) {
					return point;
				}

				const nameKey = stopKey(point?.name);
				if (!nameKey) return point;
				const matched = routeStopEntries.find((entry) => entry.cityKey === nameKey);
				if (!matched) return point;

				return {
					...point,
					stopId: matched.stopId,
					name: matched.name,
				};
			});

		setBoardingPoints(withMappedStopIds);
		setDroppingPoints(withMappedStopIds);
	}, [routeStopEntries]);

	const sortedBoardingPoints = useMemo(() => {
		const arr = Array.isArray(boardingPoints) ? boardingPoints : [];
		return [...arr].sort((a, b) => {
			const ai = pointSortIndex(a);
			const bi = pointSortIndex(b);
			if (ai !== bi) return ai - bi;
			return String(a?.name || "").localeCompare(String(b?.name || ""));
		});
	}, [boardingPoints, stopIndexByKey]);

	const sortedDroppingPoints = useMemo(() => {
		const arr = Array.isArray(droppingPoints) ? droppingPoints : [];
		return [...arr].sort((a, b) => {
			const ai = pointSortIndex(a);
			const bi = pointSortIndex(b);
			if (ai !== bi) return ai - bi;
			return String(a?.name || "").localeCompare(String(b?.name || ""));
		});
	}, [droppingPoints, stopIndexByKey]);

	const updatePointField = (setter, point, field, value) => {
		const key = pointIdentity(point);
		setter((prev) =>
			(Array.isArray(prev) ? prev : []).map((p) =>
				pointIdentity(p) === key ? { ...p, [field]: value, _auto: false } : p
			)
		);
	};

	useEffect(() => {
		if (!autoPointByKey || autoPointByKey.size === 0) return;
		const applyAuto = (prev) =>
			(Array.isArray(prev) ? prev : []).map((p) => {
				if (!p?._auto) return p;
				const auto = autoPointByKey.get(pointIdentity(p));
				if (!auto) return p;
				return { ...p, date: auto.date, time: auto.time };
			});
		setBoardingPoints(applyAuto);
		setDroppingPoints(applyAuto);
	}, [autoPointByKey]);

	const featureOptions = useMemo(() => {
		const baseKeys = new Set(FEATURE_OPTIONS.map((o) => o.key));
		const extras = (Array.isArray(features) ? features : [])
			.map((f) => String(f || "").trim())
			.filter(Boolean)
			.filter((f) => !baseKeys.has(f));
		return [...FEATURE_OPTIONS, ...extras.map((f) => ({ key: f, label: f }))];
	}, [features]);

	const amenityOptions = useMemo(() => {
		const base = BASE_AMENITY_OPTIONS;
		const baseKeys = new Set(base.map((a) => a.toLowerCase()));
		const extras = (Array.isArray(amenities) ? amenities : [])
			.map((a) => String(a || "").trim())
			.filter(Boolean)
			.filter((a) => !baseKeys.has(a.toLowerCase()));
		return [...base, ...extras];
	}, [amenities]);

	const resetForm = () => {
		setEditingId(null);
		setBusId("");
		setRouteId("");
		setDate("");
		setTime("");
		setArrivalDate("");
		setArrivalTime("");
		setDurationHours("");
		setRefundable(false);
		setFeatures([]);
		setAmenities([]);
		setRefundPolicy("");
		setCancellationPolicy("");
		setDateChangePolicy("");
		setLuggagePolicy("");
		setBoardingPoints([]);
		setDroppingPoints([]);
	};

	const loadAll = async () => {
		setLoading(true);
		setError("");
		try {
			const [b, r, s] = await Promise.all([getBuses(), getRoutes(), getSchedules()]);
			setBuses(b);
			setRoutes(r);
			setSchedules(s);
		} catch (err) {
			setError(err?.response?.data?.message || err.message || "Failed to load data");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadAll();
	}, []);

	useEffect(() => {
		if (isEditing) return;

		if (!selectedBus) {
			setRefundPolicy("");
			setCancellationPolicy("");
			setDateChangePolicy("");
			setLuggagePolicy("");
			return;
		}

		const policies = selectedBus?.policies || {};
		setRefundPolicy(String(policies?.refundPolicy || ""));
		setCancellationPolicy(String(policies?.cancellationPolicy || ""));
		setDateChangePolicy(String(policies?.dateChangePolicy || ""));
		setLuggagePolicy(String(policies?.luggagePolicy || ""));
	}, [selectedBus, isEditing]);

	const onSubmit = async (e) => {
		e.preventDefault();
		setError("");
		setActionLoading(true);
		try {
			if (!selectedRoute || routeStopEntries.length === 0) {
				throw new Error("No route stops found. Configure stops in Stop Management before creating schedule.");
			}

			let durationMinutesValue;
			if (durationHours !== "") {
				const hours = Number(durationHours);
				if (Number.isFinite(hours) && hours > 0) durationMinutesValue = Math.round(hours * 60);
			}

			const nextBoardingPoints = sanitizePoints(boardingPoints);
			const nextDroppingPoints = sanitizePoints(droppingPoints);

			if (nextBoardingPoints.length === 0) {
				throw new Error("Select at least one boarding point");
			}
			if (nextDroppingPoints.length === 0) {
				throw new Error("Select at least one dropping point");
			}

			const resolveOptionForPoint = (point, lookupMap) => {
				const direct = lookupMap.get(pointIdentity(point));
				if (direct) return direct;
				return lookupMap.get(`name:${stopKey(point?.name)}`);
			};

			const validateLanePoints = (points, label, lookupMap) => {
				const invalid = points.find((point) => !resolveOptionForPoint(point, lookupMap));
				if (invalid) {
					throw new Error(`${label} point is not valid for selected route: ${invalid?.name || "Unknown"}`);
				}
			};

			validateLanePoints(nextBoardingPoints, "Boarding", boardingOptionByIdentity);
			validateLanePoints(nextDroppingPoints, "Dropping", droppingOptionByIdentity);

			const missingBoarding = nextBoardingPoints.find((p) => !String(p?.date || "").trim() || !String(p?.time || "").trim());
			if (missingBoarding) {
				throw new Error(`Boarding point time is required for: ${missingBoarding.name}`);
			}
			const missingDropping = nextDroppingPoints.find((p) => !String(p?.date || "").trim() || !String(p?.time || "").trim());
			if (missingDropping) {
				throw new Error(`Dropping point time is required for: ${missingDropping.name}`);
			}

			const isoDateRe = /^\d{4}-\d{2}-\d{2}$/;
			const isoTimeRe = /^\d{2}:\d{2}$/;
			const toMs = (p) => {
				const d = String(p?.date || "").trim();
				const t = String(p?.time || "").trim();
				if (!isoDateRe.test(d) || !isoTimeRe.test(t)) return NaN;
				return new Date(`${d}T${t}:00`).getTime();
			};
			const validateSeq = (points, label) => {
				const enriched = points.map((p) => ({ ...p, idx: pointSortIndex(p) }));
				const unknown = enriched.find((p) => !Number.isFinite(p.idx));
				if (unknown) throw new Error(`${label} point not found in route stops: ${unknown.name}`);
				enriched.sort((a, b) => a.idx - b.idx);
				let prev = null;
				enriched.forEach((p) => {
					const ms = toMs(p);
					if (!Number.isFinite(ms)) throw new Error(`${label} point has invalid date/time: ${p.name}`);
					if (prev !== null && ms < prev) throw new Error(`${label} times must follow route order (check: ${p.name})`);
					prev = ms;
				});
			};
			validateSeq(nextBoardingPoints, "Boarding");
			validateSeq(nextDroppingPoints, "Dropping");

			const toPayloadPoint = (point, lookupMap) => {
				const option = resolveOptionForPoint(point, lookupMap);
				const optionOrder = Number(option?.order);
				const pointOrder = Number(point?.order);
				const order = Number.isFinite(optionOrder) && optionOrder > 0
					? Math.trunc(optionOrder)
					: Number.isFinite(pointOrder) && pointOrder > 0
						? Math.trunc(pointOrder)
						: undefined;

				return {
					stopId: String(option?.stopId || point?.stopId || "").trim() || undefined,
					name: String(option?.name || point?.name || "").trim(),
					date: String(point?.date || "").trim(),
					time: String(point?.time || "").trim(),
					...(Number.isFinite(order) ? { order } : {}),
				};
			};

			const payloadBoardingPoints = nextBoardingPoints.map((point) => toPayloadPoint(point, boardingOptionByIdentity));
			const payloadDroppingPoints = nextDroppingPoints.map((point) => toPayloadPoint(point, droppingOptionByIdentity));

			const payload = {
				bus: busId,
				route: routeId,
				date,
				time,
				arrivalDate: arrivalDate || undefined,
				arrivalTime: arrivalTime || undefined,
				durationMinutes: durationMinutesValue,
				refundable: Boolean(refundable),
				features: normalizeStringList(features),
				amenities: normalizeStringList(amenities),
				policies: {
					refundPolicy: refundPolicy || "",
					cancellationPolicy: cancellationPolicy || "",
					dateChangePolicy: dateChangePolicy || "",
					luggagePolicy: luggagePolicy || "",
				},
				boardingPoints: payloadBoardingPoints,
				droppingPoints: payloadDroppingPoints,
			};

			if (!payload.bus || !payload.route || !payload.date || !payload.time) {
				throw new Error("bus, route, date and time are required");
			}

			if (isEditing) {
				await updateSchedule(editingId, payload);
			} else {
				await createSchedule(payload);
			}

			resetForm();
			await loadAll();
		} catch (err) {
			setError(err?.response?.data?.message || err.message || (isEditing ? "Update failed" : "Create failed"));
		} finally {
			setActionLoading(false);
		}
	};

	const onEdit = (sch) => {
		setEditingId(sch._id);
		setBusId(sch.bus?._id || sch.bus || "");
		setRouteId(sch.route?._id || sch.route || "");
		setDate(sch.date || "");
		setTime(sch.time || "");
		setArrivalDate(sch.arrivalDate || "");
		setArrivalTime(sch.arrivalTime || "");
		if (sch.durationMinutes !== undefined && sch.durationMinutes !== null && sch.durationMinutes !== "") {
			const hours = Number(sch.durationMinutes) / 60;
			setDurationHours(Number.isFinite(hours) ? String(Math.round(hours * 100) / 100) : "");
		} else {
			setDurationHours("");
		}
		setRefundable(Boolean(sch.refundable));
		setFeatures(normalizeStringList(sch.features));
		setAmenities(normalizeStringList(sch.amenities));

		setRefundPolicy(sch.policies?.refundPolicy || "");
		setCancellationPolicy(sch.policies?.cancellationPolicy || "");
		setDateChangePolicy(sch.policies?.dateChangePolicy || "");
		setLuggagePolicy(sch.policies?.luggagePolicy || "");
		setBoardingPoints(sanitizePoints(sch.boardingPoints));
		setDroppingPoints(sanitizePoints(sch.droppingPoints));
	};

	const onDelete = async (id) => {
		if (!window.confirm("Delete this schedule?")) return;
		setError("");
		setActionLoading(true);
		try {
			await deleteSchedule(id);
			await loadAll();
		} catch (err) {
			setError(err?.response?.data?.message || err.message || "Delete failed");
		} finally {
			setActionLoading(false);
		}
	};

	const scheduleTitle = (sch) => {
		const src = sch.route?.source || "";
		const dst = sch.route?.destination || "";
		const busName = sch.bus?.name || "Bus";
		return `${src} → ${dst} • ${sch.date || ""} ${sch.time || ""} • ${busName}`.trim();
	};

	return (
		<div className="mx-auto max-w-6xl px-4 py-10">
			<div className="flex items-end justify-between gap-4">
				<div>
					<h2 className="text-2xl font-extrabold text-slate-900">Manage Schedules</h2>
					<p className="mt-1 text-sm text-slate-600">Create trips with boarding/dropping points, policies, and amenities.</p>
				</div>
				<button
					type="button"
					disabled={loading || actionLoading}
					onClick={loadAll}
					className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
				>
					Refresh
				</button>
			</div>

			{error ? (
				<div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
			) : null}

			{loading ? (
				<div className="mt-6 text-sm text-slate-600">Loading...</div>
			) : (
				<>
					{buses.length === 0 || routes.length === 0 ? (
						<div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
							Create at least one bus and one route before adding schedules.
						</div>
					) : null}

					<div className="mt-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
						<form onSubmit={onSubmit} className="grid gap-4">
							<div className="grid gap-4 lg:grid-cols-4">
								<div>
									<label className="block text-sm font-medium text-slate-700">Bus</label>
									<select
										value={busId}
										onChange={(e) => setBusId(e.target.value)}
										required
										className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
									>
										<option value="">Select bus</option>
										{buses.map((b) => (
											<option key={b._id} value={b._id}>
												{b.name} ({getBusTypeSummary(b, 2)})
											</option>
										))}
									</select>
								</div>

								<div>
									<label className="block text-sm font-medium text-slate-700">Route</label>
									<select
										value={routeId}
										onChange={(e) => {
											setRouteId(e.target.value);
											setBoardingPoints([]);
											setDroppingPoints([]);
										}}
										required
										className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
									>
										<option value="">Select route</option>
										{routes.map((r) => (
											<option key={r._id} value={r._id}>
												{r.source} → {r.destination}
											</option>
										))}
									</select>
								</div>

								<div>
									<label className="block text-sm font-medium text-slate-700">Date</label>
									<input
											type="date"
										value={date}
										onChange={(e) => setDate(e.target.value)}
										required
										className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
									/>
								</div>

								<div>
									<label className="block text-sm font-medium text-slate-700">Time</label>
									<input
											type="time"
										value={time}
										onChange={(e) => setTime(e.target.value)}
										required
										className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
									/>
								</div>
							</div>

							<div className="grid gap-4 lg:grid-cols-4">
								<div>
									<label className="block text-sm font-medium text-slate-700">Arrival date (optional)</label>
									<input
										type="date"
										value={arrivalDate}
										onChange={(e) => setArrivalDate(e.target.value)}
										className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-slate-700">Arrival time (optional)</label>
									<input
										type="time"
										value={arrivalTime}
										onChange={(e) => setArrivalTime(e.target.value)}
										className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-slate-700">Duration (hours)</label>
									<input
										type="number"
										min={0.25}
										step={0.25}
										value={durationHours}
										onChange={(e) => setDurationHours(e.target.value)}
										placeholder="e.g., 6"
										className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
									/>
									<p className="mt-2 text-xs text-slate-500">Saved as minutes in the backend.</p>
								</div>
								<div className="flex items-end gap-3">
									<label className="inline-flex select-none items-center gap-2 text-sm font-medium text-slate-700">
										<input
											type="checkbox"
											checked={refundable}
											onChange={(e) => setRefundable(e.target.checked)}
											className="h-4 w-4 rounded border-slate-300 text-orange-500"
										/>
										Refundable
									</label>
								</div>
							</div>

							<div className="grid gap-4 lg:grid-cols-3">
										<div className="lg:col-span-3 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
											Seat pricing is managed in Bus Layout and applied automatically during booking.
										</div>
							</div>

							<div className="rounded-2xl border border-slate-100 bg-slate-50 p-5">
								<div className="text-sm font-semibold text-slate-700">Options</div>
								<p className="mt-1 text-xs text-slate-500">Tick the options you want to show on booking pages.</p>

								<div className="mt-4 grid gap-4 lg:grid-cols-2">
									<div className="rounded-xl border border-slate-100 bg-white p-4">
										<div className="text-xs font-semibold text-slate-600">Features</div>
										<div className="mt-3 grid gap-2 sm:grid-cols-2">
											{featureOptions.map((opt) => (
												<label key={opt.key} className="inline-flex select-none items-center gap-2 text-sm text-slate-700">
													<input
														type="checkbox"
														checked={features.includes(opt.key)}
														onChange={() => setFeatures((prev) => toggleValue(prev, opt.key))}
														className="h-4 w-4 rounded border-slate-300 text-orange-500"
													/>
													{opt.label}
												</label>
											))}
										</div>
									</div>

									<div className="rounded-xl border border-slate-100 bg-white p-4">
										<div className="text-xs font-semibold text-slate-600">Amenities</div>
										<div className="mt-3 grid gap-2 sm:grid-cols-2">
											{amenityOptions.map((a) => (
												<label key={a} className="inline-flex select-none items-center gap-2 text-sm text-slate-700">
													<input
														type="checkbox"
														checked={amenities.includes(a)}
														onChange={() => setAmenities((prev) => toggleValue(prev, a))}
														className="h-4 w-4 rounded border-slate-300 text-orange-500"
													/>
													{a}
												</label>
											))}
										</div>
									</div>

									<div className="rounded-xl border border-slate-100 bg-white p-4">
										<div className="text-xs font-semibold text-slate-600">Boarding points</div>
										{groupedBoardingPointOptions.length === 0 ? (
											<div className="mt-3 text-xs text-slate-500">Select a route with pickup stops to see options.</div>
										) : (
											<div className="mt-3 space-y-3">
												{groupedBoardingPointOptions.map((group) => (
													<div key={`boarding-${group.district}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
														<div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">{group.district}</div>
														<div className="grid gap-2 sm:grid-cols-2">
															{group.stops.map((option) => {
																const optionKey = pointIdentity(option);
																const checked = boardingPoints.some(
																	(p) => pointIdentity(p) === optionKey || stopKey(p?.name) === option.cityKey
																);
																const templateLabel = formatTemplateTimeLabel(option);

																return (
																	<label key={optionKey} className="inline-flex select-none items-start gap-2 text-sm text-slate-700">
																		<input
																			type="checkbox"
																			checked={checked}
																			onChange={() =>
																			setBoardingPoints((prev) => {
																				const auto = autoPointByKey.get(optionKey);
																				return togglePointByStop(prev, option, auto ? { ...auto, _auto: true } : { date, time, _auto: false });
																			})
																		}
																		className="mt-0.5 h-4 w-4 rounded border-slate-300 text-orange-500"
																	/>
																		<span>
																			<span className="block">{option.name}</span>
																			{templateLabel ? <span className="text-xs text-slate-500">{templateLabel}</span> : null}
																		</span>
																	</label>
																);
															})}
														</div>
													</div>
												))}
											</div>
										)}

										{sortedBoardingPoints.length > 0 ? (
											<div className="mt-4 space-y-3">
												<div className="text-xs font-semibold text-slate-600">Pickup times</div>
												{sortedBoardingPoints.map((p) => (
													<div key={pointIdentity(p)} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
														<div className="text-sm font-semibold text-slate-800">{p.name}</div>
														<div className="mt-2 grid gap-3 sm:grid-cols-2">
															<div>
																<label className="block text-[11px] font-semibold text-slate-600">Date</label>
																<input
																	type="date"
																	value={p.date || ""}
																	onChange={(e) => updatePointField(setBoardingPoints, p, "date", e.target.value)}
																	className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
																/>
															</div>
															<div>
																<label className="block text-[11px] font-semibold text-slate-600">Time</label>
																<input
																	type="time"
																	value={p.time || ""}
																	onChange={(e) => updatePointField(setBoardingPoints, p, "time", e.target.value)}
																	className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
																/>
															</div>
														</div>
													</div>
												))}
											</div>
										) : null}
									</div>

									<div className="rounded-xl border border-slate-100 bg-white p-4">
										<div className="text-xs font-semibold text-slate-600">Dropping points</div>
										{groupedDroppingPointOptions.length === 0 ? (
											<div className="mt-3 text-xs text-slate-500">Select a route with dropping stops to see options.</div>
										) : (
											<div className="mt-3 space-y-3">
												{groupedDroppingPointOptions.map((group) => (
													<div key={`dropping-${group.district}`} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
														<div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-600">{group.district}</div>
														<div className="grid gap-2 sm:grid-cols-2">
															{group.stops.map((option) => {
																const optionKey = pointIdentity(option);
																const checked = droppingPoints.some(
																	(p) => pointIdentity(p) === optionKey || stopKey(p?.name) === option.cityKey
																);
																const templateLabel = formatTemplateTimeLabel(option);

																return (
																	<label key={optionKey} className="inline-flex select-none items-start gap-2 text-sm text-slate-700">
																		<input
																			type="checkbox"
																			checked={checked}
																			onChange={() =>
																			setDroppingPoints((prev) => {
																				const auto = autoPointByKey.get(optionKey);
																				return togglePointByStop(
																					prev,
																					option,
																					auto
																						? { ...auto, _auto: true }
																						: { date: arrivalDate || date, time: arrivalTime || time, _auto: false }
																				);
																			})
																		}
																		className="mt-0.5 h-4 w-4 rounded border-slate-300 text-orange-500"
																	/>
																		<span>
																			<span className="block">{option.name}</span>
																			{templateLabel ? <span className="text-xs text-slate-500">{templateLabel}</span> : null}
																		</span>
																	</label>
																);
															})}
														</div>
													</div>
												))}
											</div>
										)}

										{sortedDroppingPoints.length > 0 ? (
											<div className="mt-4 space-y-3">
												<div className="text-xs font-semibold text-slate-600">Drop times</div>
												{sortedDroppingPoints.map((p) => (
													<div key={pointIdentity(p)} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
														<div className="text-sm font-semibold text-slate-800">{p.name}</div>
														<div className="mt-2 grid gap-3 sm:grid-cols-2">
															<div>
																<label className="block text-[11px] font-semibold text-slate-600">Date</label>
																<input
																	type="date"
																	value={p.date || ""}
																	onChange={(e) => updatePointField(setDroppingPoints, p, "date", e.target.value)}
																	className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
																/>
															</div>
															<div>
																<label className="block text-[11px] font-semibold text-slate-600">Time</label>
																<input
																	type="time"
																	value={p.time || ""}
																	onChange={(e) => updatePointField(setDroppingPoints, p, "time", e.target.value)}
																	className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
																/>
															</div>
														</div>
													</div>
												))}
											</div>
										) : null}
									</div>
								</div>
							</div>

							{showBusPolicyLoadedHint ? (
								<div
									className={`rounded-xl border px-3 py-2 text-xs font-medium ${
										selectedBusHasPolicies
											? "border-emerald-200 bg-emerald-50 text-emerald-800"
											: "border-amber-200 bg-amber-50 text-amber-800"
									}`}
								>
									{selectedBusHasPolicies
										? `Policies loaded from selected bus${selectedBus?.name ? `: ${selectedBus.name}` : ""}.`
										: `Selected bus${selectedBus?.name ? ` (${selectedBus.name})` : ""} has no saved policies yet. You can enter them manually.`}
								</div>
							) : null}

							<div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
								<div>
									<label className="block text-sm font-medium text-slate-700">Refund policy</label>
									<textarea
										rows={3}
										value={refundPolicy}
										onChange={(e) => setRefundPolicy(e.target.value)}
										placeholder="Write refund details..."
										className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-slate-700">Cancellation policy</label>
									<textarea
										rows={3}
										value={cancellationPolicy}
										onChange={(e) => setCancellationPolicy(e.target.value)}
										placeholder="Write cancellation rules..."
										className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-slate-700">Date change policy</label>
									<textarea
										rows={3}
										value={dateChangePolicy}
										onChange={(e) => setDateChangePolicy(e.target.value)}
										placeholder="Write date-change rules..."
										className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-slate-700">Luggage policy</label>
									<textarea
										rows={3}
										value={luggagePolicy}
										onChange={(e) => setLuggagePolicy(e.target.value)}
										placeholder="Write luggage allowance and restrictions..."
										className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
									/>
								</div>
							</div>

							<div className="flex flex-wrap gap-3">
								<button
									type="submit"
									disabled={actionLoading}
									className="inline-flex items-center justify-center rounded-xl bg-orange-400 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 disabled:opacity-60"
								>
									{isEditing ? "Save schedule" : "Add schedule"}
								</button>
								{isEditing ? (
									<button
										type="button"
										disabled={actionLoading}
										onClick={resetForm}
										className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
									>
										Cancel
									</button>
								) : null}
							</div>
						</form>
					</div>

					<div className="mt-8">
						<div className="text-sm font-semibold text-slate-700">All schedules</div>
						<div className="mt-3 grid gap-4">
							{schedules.map((sch) => (
								<div key={sch._id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
									<div className="flex flex-wrap items-start justify-between gap-3">
										<div>
											<div className="text-base font-extrabold text-slate-900">{scheduleTitle(sch)}</div>
											<div className="mt-1 text-sm text-slate-600">
												Fare: <span className="font-semibold text-slate-900">{getScheduleFareSummary(sch)}</span>
												{sch.refundable ? <span className="ml-2 rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">Refundable</span> : null}
											</div>
										</div>

										<div className="flex gap-2">
											<button
												type="button"
												disabled={actionLoading}
												onClick={() => onEdit(sch)}
												className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
											>
												Edit
											</button>
											<button
												type="button"
												disabled={actionLoading}
												onClick={() => onDelete(sch._id)}
												className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-semibold text-red-700 shadow-sm hover:bg-red-50 disabled:opacity-60"
											>
												Delete
											</button>
										</div>
									</div>

									{Array.isArray(sch.boardingPoints) && sch.boardingPoints.length > 0 ? (
										<div className="mt-4 text-sm">
											<span className="font-semibold text-slate-700">Boarding:</span> {sch.boardingPoints.map((p) => p?.name).filter(Boolean).join(", ")}
										</div>
									) : null}
									{Array.isArray(sch.droppingPoints) && sch.droppingPoints.length > 0 ? (
										<div className="mt-1 text-sm">
											<span className="font-semibold text-slate-700">Dropping:</span> {sch.droppingPoints.map((p) => p?.name).filter(Boolean).join(", ")}
										</div>
									) : null}
								</div>
							))}
							{schedules.length === 0 ? <div className="text-sm text-slate-600">No schedules.</div> : null}
						</div>
					</div>
				</>
			)}
		</div>
	);
}
