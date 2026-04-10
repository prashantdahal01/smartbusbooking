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
import { formatCurrency } from "../../utils/helpers";

const stopKey = (s) => String(s || "").trim().toLowerCase();

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

const sanitizePoints = (points) => {
	const arr = Array.isArray(points) ? points : [];
	const seen = new Set();
	const out = [];
	arr.forEach((p) => {
		const name = String(p?.name || "").trim();
		if (!name) return;
		const k = name.toLowerCase();
		if (seen.has(k)) return;
		seen.add(k);
		out.push({
			name,
			time: String(p?.time || "").trim(),
			date: String(p?.date || "").trim(),
		});
	});
	return out;
};

const toggleValue = (list, value) => {
	const v = String(value || "").trim();
	if (!v) return list;
	return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
};

const togglePointByName = (points, name, defaults = {}) => {
	const n = String(name || "").trim();
	if (!n) return points;
	const key = n.toLowerCase();
	const exists = points.some((p) => String(p?.name || "").trim().toLowerCase() === key);
	if (exists) return points.filter((p) => String(p?.name || "").trim().toLowerCase() !== key);
	const nextDate = String(defaults?.date || "").trim();
	const nextTime = String(defaults?.time || "").trim();
	const isAuto = Boolean(defaults?._auto);
	return [...points, { name: n, time: nextTime, date: nextDate, _auto: isAuto }];
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
	const [price, setPrice] = useState("");
	const [priceMin, setPriceMin] = useState("");
	const [priceMax, setPriceMax] = useState("");
	const [refundable, setRefundable] = useState(false);
	const [features, setFeatures] = useState([]);
	const [amenities, setAmenities] = useState([]);

	const [refundPolicy, setRefundPolicy] = useState("");
	const [cancellationPolicy, setCancellationPolicy] = useState("");
	const [dateChangePolicy, setDateChangePolicy] = useState("");
	const [boardingPoints, setBoardingPoints] = useState([]);
	const [droppingPoints, setDroppingPoints] = useState([]);
	const [routeStopDocs, setRouteStopDocs] = useState([]);

	const selectedRoute = useMemo(() => routes.find((r) => r._id === routeId) || null, [routes, routeId]);
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
	const stopOptions = useMemo(() => {
		if (!selectedRoute) return [];
		const midsRaw = Array.isArray(selectedRoute.stops) ? selectedRoute.stops : [];
		const mids = midsRaw.map((s) => String(toStopName(s) || "").trim()).filter(Boolean);
		const list = [selectedRoute.source, ...mids, selectedRoute.destination]
			.map((s) => String(s || "").trim())
			.filter(Boolean);
		const seen = new Set();
		const out = [];
		list.forEach((s) => {
			const k = s.toLowerCase();
			if (seen.has(k)) return;
			seen.add(k);
			out.push(s);
		});
		return out;
	}, [selectedRoute]);

	const hasStopTemplates = useMemo(() => Array.isArray(routeStopDocs) && routeStopDocs.length > 0, [routeStopDocs]);

	const stopDocByKey = useMemo(() => {
		const map = new Map();
		(Array.isArray(routeStopDocs) ? routeStopDocs : []).forEach((s) => {
			const name = String(s?.city || "").trim();
			const k = stopKey(name);
			if (!k) return;
			map.set(k, s);
		});
		return map;
	}, [routeStopDocs]);

	const boardingBaseOptions = useMemo(() => {
		if (!selectedRoute) return [];
		if (!hasStopTemplates) return stopOptions;
		const srcKey = stopKey(selectedRoute.source);
		return stopOptions.filter((name) => {
			const k = stopKey(name);
			if (!k) return false;
			if (k === srcKey) return true;
			const doc = stopDocByKey.get(k);
			const t = String(doc?.type || "").trim().toLowerCase();
			return t === "pickup" || t === "both";
		});
	}, [hasStopTemplates, selectedRoute, stopDocByKey, stopOptions]);

	const droppingBaseOptions = useMemo(() => {
		if (!selectedRoute) return [];
		if (!hasStopTemplates) return stopOptions;
		const dstKey = stopKey(selectedRoute.destination);
		return stopOptions.filter((name) => {
			const k = stopKey(name);
			if (!k) return false;
			if (k === dstKey) return true;
			const doc = stopDocByKey.get(k);
			const t = String(doc?.type || "").trim().toLowerCase();
			return t === "drop" || t === "both";
		});
	}, [hasStopTemplates, selectedRoute, stopDocByKey, stopOptions]);

	const boardingPointOptions = useMemo(() => {
		const base = boardingBaseOptions;
		const baseKeys = new Set(base.map((s) => stopKey(s)));
		const extras = (Array.isArray(boardingPoints) ? boardingPoints : [])
			.map((p) => String(p?.name || "").trim())
			.filter(Boolean)
			.filter((n) => !baseKeys.has(stopKey(n)));
		return [...base, ...extras];
	}, [boardingBaseOptions, boardingPoints]);

	const droppingPointOptions = useMemo(() => {
		const base = droppingBaseOptions;
		const baseKeys = new Set(base.map((s) => stopKey(s)));
		const extras = (Array.isArray(droppingPoints) ? droppingPoints : [])
			.map((p) => String(p?.name || "").trim())
			.filter(Boolean)
			.filter((n) => !baseKeys.has(stopKey(n)));
		return [...base, ...extras];
	}, [droppingBaseOptions, droppingPoints]);

	const stopKmByKey = useMemo(() => {
		const map = new Map();
		if (!selectedRoute) return map;
		const totalKm = Number(selectedRoute.distance);
		if (!Number.isFinite(totalKm) || totalKm <= 0) return map;

		const srcName = String(selectedRoute.source || "").trim();
		const dstName = String(selectedRoute.destination || "").trim();
		if (srcName) map.set(stopKey(srcName), 0);
		if (dstName) map.set(stopKey(dstName), totalKm);

		const midsRaw = Array.isArray(selectedRoute.stops) ? selectedRoute.stops : [];
		midsRaw.forEach((raw) => {
			const name = String(toStopName(raw) || "").trim();
			if (!name) return;
			const k = stopKey(name);
			if (!k) return;
			if (k === stopKey(srcName) || k === stopKey(dstName)) return;
			const kmRaw = toStopKmFromSource(raw);
			const km = kmRaw !== undefined && kmRaw !== null && kmRaw !== "" ? Number(kmRaw) : NaN;
			if (!Number.isFinite(km)) return;
			map.set(k, Math.max(0, Math.min(totalKm, km)));
		});

		// Fill any missing stops by index-based spacing.
		if (Array.isArray(stopOptions) && stopOptions.length > 1) {
			stopOptions.forEach((name, idx) => {
				const k = stopKey(name);
				if (!k || map.has(k)) return;
				map.set(k, (idx / (stopOptions.length - 1)) * totalKm);
			});
		}

		return map;
	}, [selectedRoute, stopOptions]);

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
		if (!selectedRoute) return map;
		if (!Number.isFinite(departureMs)) return map;

		const baseDate = String(date || "").trim();
		const srcName = String(selectedRoute.source || "").trim();
		const dstName = String(selectedRoute.destination || "").trim();
		const srcKey = stopKey(srcName);
		const dstKey = stopKey(dstName);

		// Source is always the schedule departure time.
		if (srcKey) {
			map.set(srcKey, { date: formatLocalDate(departureMs), time: formatLocalTime(departureMs) });
		}

		const isValidHHmm = (s) => /^\d{2}:\d{2}$/.test(String(s || "").trim());

		// 1) Stop template timing overrides interpolation.
		stopOptions.forEach((name) => {
			const k = stopKey(name);
			if (!k || k === srcKey) return;

			const doc = stopDocByKey.get(k);
			if (!doc) return;

			const abs = String(doc?.absoluteTime !== undefined ? doc.absoluteTime : doc?.time || "").trim();
			if (abs && isValidHHmm(abs)) {
				const parsed = parseIsoDateTimeMs(baseDate, abs);
				if (!Number.isFinite(parsed)) return;
				let ms = parsed;
				while (ms < departureMs) ms += 24 * 60 * 60 * 1000;
				map.set(k, { date: formatLocalDate(ms), time: formatLocalTime(ms) });
				return;
			}

			const offsetRaw =
				doc?.offsetMinutes !== undefined && doc?.offsetMinutes !== null
					? doc.offsetMinutes
					: doc?.offset !== undefined && doc?.offset !== null
						? doc.offset
						: null;

			if (offsetRaw === null || offsetRaw === undefined || offsetRaw === "") return;
			const offset = Number(offsetRaw);
			if (!Number.isFinite(offset) || offset < 0) return;
			const ms = departureMs + Math.round(offset) * 60 * 1000;
			map.set(k, { date: formatLocalDate(ms), time: formatLocalTime(ms) });
		});

		// 2) Interpolation fallback (only if arrival/duration is known).
		if (Number.isFinite(arrivalMs) && arrivalMs > departureMs) {
			const totalKm = Number(selectedRoute.distance);
			if (Number.isFinite(totalKm) && totalKm > 0) {
				stopOptions.forEach((name) => {
					const k = stopKey(name);
					if (!k || map.has(k)) return;
					const km = stopKmByKey.get(k);
					if (!Number.isFinite(km)) return;
					const frac = totalKm > 0 ? km / totalKm : 0;
					const ms = departureMs + Math.round(frac * (arrivalMs - departureMs));
					map.set(k, { date: formatLocalDate(ms), time: formatLocalTime(ms) });
				});
			}

			// Ensure destination gets a value when arrival is set.
			if (dstKey && !map.has(dstKey)) {
				map.set(dstKey, { date: formatLocalDate(arrivalMs), time: formatLocalTime(arrivalMs) });
			}
		}

		return map;
	}, [arrivalMs, date, departureMs, selectedRoute, stopDocByKey, stopKmByKey, stopOptions]);

	const stopIndexByKey = useMemo(() => {
		const map = new Map();
		stopOptions.forEach((s, idx) => {
			const k = String(s || "").trim().toLowerCase();
			if (!k) return;
			if (!map.has(k)) map.set(k, idx);
		});
		return map;
	}, [stopOptions]);

	useEffect(() => {
		if (!selectedRoute) return;
		if (isEditing) return;
		if (!hasStopTemplates) return;
		if ((Array.isArray(boardingPoints) && boardingPoints.length > 0) || (Array.isArray(droppingPoints) && droppingPoints.length > 0)) return;

		const src = String(selectedRoute.source || "").trim();
		const dst = String(selectedRoute.destination || "").trim();

		const pick = [];
		const drop = [];
		if (src) pick.push(src);
		if (dst) drop.push(dst);

		(Array.isArray(routeStopDocs) ? routeStopDocs : []).forEach((s) => {
			const name = String(s?.city || "").trim();
			if (!name) return;
			const t = String(s?.type || "").trim().toLowerCase();
			if (t === "pickup" || t === "both") pick.push(name);
			if (t === "drop" || t === "both") drop.push(name);
		});

		const uniq = (arr) => {
			const out = [];
			const seen = new Set();
			arr.forEach((n) => {
				const k = stopKey(n);
				if (!k || seen.has(k)) return;
				seen.add(k);
				out.push(n);
			});
			return out;
		};

		const toPoint = (name) => {
			const auto = autoPointByKey.get(stopKey(name));
			return { name, date: auto?.date || "", time: auto?.time || "", _auto: true };
		};

		const nextBoarding = uniq(pick)
			.filter((n) => stopIndexByKey.has(stopKey(n)))
			.map(toPoint);
		const nextDropping = uniq(drop)
			.filter((n) => stopIndexByKey.has(stopKey(n)))
			.map(toPoint);

		if (nextBoarding.length > 0) setBoardingPoints(nextBoarding);
		if (nextDropping.length > 0) setDroppingPoints(nextDropping);
	}, [autoPointByKey, boardingPoints, droppingPoints, hasStopTemplates, isEditing, routeStopDocs, selectedRoute, stopIndexByKey]);

	const sortedBoardingPoints = useMemo(() => {
		const arr = Array.isArray(boardingPoints) ? boardingPoints : [];
		return [...arr].sort((a, b) => {
			const ai = stopIndexByKey.get(stopKey(a?.name)) ?? Number.POSITIVE_INFINITY;
			const bi = stopIndexByKey.get(stopKey(b?.name)) ?? Number.POSITIVE_INFINITY;
			if (ai !== bi) return ai - bi;
			return String(a?.name || "").localeCompare(String(b?.name || ""));
		});
	}, [boardingPoints, stopIndexByKey]);

	const sortedDroppingPoints = useMemo(() => {
		const arr = Array.isArray(droppingPoints) ? droppingPoints : [];
		return [...arr].sort((a, b) => {
			const ai = stopIndexByKey.get(stopKey(a?.name)) ?? Number.POSITIVE_INFINITY;
			const bi = stopIndexByKey.get(stopKey(b?.name)) ?? Number.POSITIVE_INFINITY;
			if (ai !== bi) return ai - bi;
			return String(a?.name || "").localeCompare(String(b?.name || ""));
		});
	}, [droppingPoints, stopIndexByKey]);

	const updatePointField = (setter, name, field, value) => {
		const nKey = String(name || "").trim().toLowerCase();
		setter((prev) =>
			(Array.isArray(prev) ? prev : []).map((p) =>
				String(p?.name || "").trim().toLowerCase() === nKey ? { ...p, [field]: value, _auto: false } : p
			)
		);
	};

	useEffect(() => {
		if (!autoPointByKey || autoPointByKey.size === 0) return;
		const applyAuto = (prev) =>
			(Array.isArray(prev) ? prev : []).map((p) => {
				if (!p?._auto) return p;
				const auto = autoPointByKey.get(stopKey(p?.name));
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
		setPrice("");
		setPriceMin("");
		setPriceMax("");
		setRefundable(false);
		setFeatures([]);
		setAmenities([]);
		setRefundPolicy("");
		setCancellationPolicy("");
		setDateChangePolicy("");
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

	const onSubmit = async (e) => {
		e.preventDefault();
		setError("");
		setActionLoading(true);
		try {
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
				const enriched = points.map((p) => ({ ...p, idx: stopIndexByKey.get(stopKey(p?.name)) }));
				const unknown = enriched.find((p) => p.idx === undefined);
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

			const payload = {
				bus: busId,
				route: routeId,
				date,
				time,
				arrivalDate: arrivalDate || undefined,
				arrivalTime: arrivalTime || undefined,
				durationMinutes: durationMinutesValue,
				price: price !== "" ? Number(price) : undefined,
				priceMin: priceMin !== "" ? Number(priceMin) : undefined,
				priceMax: priceMax !== "" ? Number(priceMax) : undefined,
				refundable: Boolean(refundable),
				features: normalizeStringList(features),
				amenities: normalizeStringList(amenities),
				policies: {
					refundPolicy: refundPolicy || "",
					cancellationPolicy: cancellationPolicy || "",
					dateChangePolicy: dateChangePolicy || "",
				},
				boardingPoints: nextBoardingPoints,
				droppingPoints: nextDroppingPoints,
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
		setPrice(sch.price ?? "");
		setPriceMin(sch.priceMin ?? "");
		setPriceMax(sch.priceMax ?? "");
		setRefundable(Boolean(sch.refundable));
		setFeatures(normalizeStringList(sch.features));
		setAmenities(normalizeStringList(sch.amenities));

		setRefundPolicy(sch.policies?.refundPolicy || "");
		setCancellationPolicy(sch.policies?.cancellationPolicy || "");
		setDateChangePolicy(sch.policies?.dateChangePolicy || "");
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
												{b.name} ({b.type || "Bus"})
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
								<div>
									<label className="block text-sm font-medium text-slate-700">Price per seat</label>
									<input
										type="number"
										min={0}
										value={price}
										onChange={(e) => setPrice(e.target.value)}
										required
										placeholder="e.g., 599"
										className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-slate-700">Price min (optional)</label>
									<input
										type="number"
										min={0}
										value={priceMin}
										onChange={(e) => setPriceMin(e.target.value)}
										placeholder="e.g., 499"
										className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
									/>
								</div>
								<div>
									<label className="block text-sm font-medium text-slate-700">Price max (optional)</label>
									<input
										type="number"
										min={0}
										value={priceMax}
										onChange={(e) => setPriceMax(e.target.value)}
										placeholder="e.g., 899"
										className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
									/>
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
										{boardingPointOptions.length === 0 ? (
											<div className="mt-3 text-xs text-slate-500">Select a route to see stop options.</div>
										) : (
											<div className="mt-3 grid gap-2 sm:grid-cols-2">
												{boardingPointOptions.map((name) => (
													<label key={name} className="inline-flex select-none items-center gap-2 text-sm text-slate-700">
														<input
															type="checkbox"
															checked={boardingPoints.some((p) => String(p?.name || "").trim().toLowerCase() === String(name).trim().toLowerCase())}
															onChange={() =>
															setBoardingPoints((prev) => {
																const auto = autoPointByKey.get(stopKey(name));
																return togglePointByName(prev, name, auto ? { ...auto, _auto: true } : { date, time, _auto: false });
															})
														}
															className="h-4 w-4 rounded border-slate-300 text-orange-500"
														/>
														{name}
													</label>
												))}
											</div>
										)}

										{sortedBoardingPoints.length > 0 ? (
											<div className="mt-4 space-y-3">
												<div className="text-xs font-semibold text-slate-600">Pickup times</div>
												{sortedBoardingPoints.map((p) => (
													<div key={p.name} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
														<div className="text-sm font-semibold text-slate-800">{p.name}</div>
														<div className="mt-2 grid gap-3 sm:grid-cols-2">
															<div>
																<label className="block text-[11px] font-semibold text-slate-600">Date</label>
																<input
																	type="date"
																	value={p.date || ""}
																	onChange={(e) => updatePointField(setBoardingPoints, p.name, "date", e.target.value)}
																	className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
																/>
															</div>
															<div>
																<label className="block text-[11px] font-semibold text-slate-600">Time</label>
																<input
																	type="time"
																	value={p.time || ""}
																	onChange={(e) => updatePointField(setBoardingPoints, p.name, "time", e.target.value)}
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
										{droppingPointOptions.length === 0 ? (
											<div className="mt-3 text-xs text-slate-500">Select a route to see stop options.</div>
										) : (
											<div className="mt-3 grid gap-2 sm:grid-cols-2">
												{droppingPointOptions.map((name) => (
													<label key={name} className="inline-flex select-none items-center gap-2 text-sm text-slate-700">
														<input
															type="checkbox"
															checked={droppingPoints.some((p) => String(p?.name || "").trim().toLowerCase() === String(name).trim().toLowerCase())}
															onChange={() =>
															setDroppingPoints((prev) => {
																const auto = autoPointByKey.get(stopKey(name));
																return togglePointByName(
																	prev,
																	name,
																	auto ? { ...auto, _auto: true } : { date: arrivalDate || date, time: arrivalTime, _auto: false }
																);
															})
														}
															className="h-4 w-4 rounded border-slate-300 text-orange-500"
														/>
														{name}
													</label>
												))}
											</div>
										)}

										{sortedDroppingPoints.length > 0 ? (
											<div className="mt-4 space-y-3">
												<div className="text-xs font-semibold text-slate-600">Drop times</div>
												{sortedDroppingPoints.map((p) => (
													<div key={p.name} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
														<div className="text-sm font-semibold text-slate-800">{p.name}</div>
														<div className="mt-2 grid gap-3 sm:grid-cols-2">
															<div>
																<label className="block text-[11px] font-semibold text-slate-600">Date</label>
																<input
																	type="date"
																	value={p.date || ""}
																	onChange={(e) => updatePointField(setDroppingPoints, p.name, "date", e.target.value)}
																	className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
																/>
															</div>
															<div>
																<label className="block text-[11px] font-semibold text-slate-600">Time</label>
																<input
																	type="time"
																	value={p.time || ""}
																	onChange={(e) => updatePointField(setDroppingPoints, p.name, "time", e.target.value)}
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

							<div className="grid gap-4 lg:grid-cols-3">
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
												Price: <span className="font-semibold text-slate-900">{formatCurrency(sch.price)}</span>
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
