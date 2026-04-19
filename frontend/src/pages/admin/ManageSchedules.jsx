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
import { getSeatStatus } from "../../services/booking.service";
import MultiDatePicker from "../../components/admin/schedules/MultiDatePicker";
import RouteScheduleGroup from "../../components/admin/schedules/RouteScheduleGroup";
import ScheduleCard from "../../components/admin/schedules/ScheduleCard";
import ScheduleFilters from "../../components/admin/schedules/ScheduleFilters";
import SegmentedTimePicker from "../../components/admin/schedules/SegmentedTimePicker";
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

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

const DEPARTURE_TEMPLATES = [
	{ label: "Morning", time: "06:30", durationHours: "6" },
	{ label: "Noon", time: "12:00", durationHours: "5" },
	{ label: "Evening", time: "17:30", durationHours: "7" },
	{ label: "Night", time: "21:00", durationHours: "8" },
];

const DURATION_PRESET_HOURS = ["4", "6", "8", "10"];

const parseDateKeyMs = (dateKey) => {
	const raw = String(dateKey || "").trim();
	if (!DATE_KEY_RE.test(raw)) return NaN;

	const [yearRaw, monthRaw, dayRaw] = raw.split("-");
	const year = Number(yearRaw);
	const month = Number(monthRaw);
	const day = Number(dayRaw);
	if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return NaN;

	const date = new Date(year, month - 1, day);
	if (Number.isNaN(date.getTime())) return NaN;
	if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return NaN;

	return date.getTime();
};

const sortDateKeys = (dateKeys) => {
	const parsed = (Array.isArray(dateKeys) ? dateKeys : [])
		.map((dateKey) => {
			const ms = parseDateKeyMs(dateKey);
			if (!Number.isFinite(ms)) return null;
			return {
				key: formatLocalDate(ms),
				ms,
			};
		})
		.filter(Boolean);

	const unique = Array.from(new Map(parsed.map((item) => [item.key, item])).values());
	unique.sort((left, right) => left.ms - right.ms);
	return unique.map((item) => item.key);
};

const formatDisplayDate = (dateKey) => {
	const ms = parseDateKeyMs(dateKey);
	if (!Number.isFinite(ms)) return dateKey;
	return new Date(ms).toLocaleDateString(undefined, {
		weekday: "short",
		month: "short",
		day: "numeric",
	});
};

const formatDisplayTime = (timeValue) => {
	const raw = String(timeValue || "").trim();
	if (!/^\d{2}:\d{2}$/.test(raw)) return raw || "--";

	const [hoursRaw, minutes] = raw.split(":");
	const hours24 = Number(hoursRaw);
	if (!Number.isInteger(hours24) || hours24 < 0 || hours24 > 23) return raw;

	const suffix = hours24 >= 12 ? "PM" : "AM";
	const hours12 = hours24 % 12 || 12;
	return `${hours12}:${minutes} ${suffix}`;
};

const getTodayDateKey = () => formatLocalDate(Date.now());

const resolveScheduleEndMs = (schedule) => {
	const startMs = parseIsoDateTimeMs(schedule?.date, schedule?.time);
	if (!Number.isFinite(startMs)) return NaN;

	const parsedArrivalMs = parseIsoDateTimeMs(schedule?.arrivalDate || schedule?.date, schedule?.arrivalTime);
	if (Number.isFinite(parsedArrivalMs) && parsedArrivalMs > startMs) return parsedArrivalMs;

	const durationMinutes = Number(schedule?.durationMinutes);
	if (Number.isFinite(durationMinutes) && durationMinutes > 0) {
		return startMs + Math.round(durationMinutes) * 60 * 1000;
	}

	return startMs + 60 * 60 * 1000;
};

const getApiErrorMessage = (error, fallback = "Request failed") => {
	return error?.response?.data?.message || error?.message || fallback;
};

const isConflictCreationError = (error) => {
	const status = Number(error?.response?.status);
	if (status === 409) return true;

	const message = getApiErrorMessage(error, "").toLowerCase();
	return /conflict|overlap|already (exists|assigned|scheduled)|duplicate|e11000/.test(message);
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

const normalizeText = (value) => String(value || "").trim();

const toRouteStopName = (value) => {
	if (typeof value === "string") return normalizeText(value);
	if (!value || typeof value !== "object") return "";

	return normalizeText(value?.name || value?.city || value?.cityName || value?.label);
};

const extractRouteStops = (schedule) => {
	const routeStops = (Array.isArray(schedule?.route?.stops) ? schedule.route.stops : [])
		.map((stop) => toRouteStopName(stop))
		.filter(Boolean);

	if (routeStops.length > 0) {
		return [...new Set(routeStops)];
	}

	const fallbackStops = [
		...(Array.isArray(schedule?.boardingPoints) ? schedule.boardingPoints : []),
		...(Array.isArray(schedule?.droppingPoints) ? schedule.droppingPoints : []),
	]
		.map((point) => normalizeText(point?.name))
		.filter(Boolean);

	return [...new Set(fallbackStops)];
};

const getScheduleRouteLabelParts = (schedule) => {
	const source = normalizeText(schedule?.route?.source || schedule?.source || "Unknown");
	const destination = normalizeText(schedule?.route?.destination || schedule?.destination || "Unknown");

	return {
		source,
		destination,
	};
};

const getScheduleRouteLabel = (schedule) => {
	const parts = getScheduleRouteLabelParts(schedule);
	return `${parts.source} -> ${parts.destination}`;
};

const getBusSeatCapacity = (bus) => {
	const fromDecks = (Array.isArray(bus?.decks) ? bus.decks : []).reduce((count, deck) => {
		const seats = Array.isArray(deck?.seats) ? deck.seats.length : 0;
		return count + seats;
	}, 0);

	if (fromDecks > 0) return fromDecks;

	const fromTotal = Number(bus?.totalSeats);
	if (Number.isFinite(fromTotal) && fromTotal > 0) return Math.trunc(fromTotal);

	return 0;
};

const getSchedulePriceValue = (schedule) => {
	const legacyPrice = Number(schedule?.price);
	if (Number.isFinite(legacyPrice) && legacyPrice >= 0) return legacyPrice;

	const prices = (Array.isArray(schedule?.bus?.decks) ? schedule.bus.decks : [])
		.flatMap((deck) => (Array.isArray(deck?.seats) ? deck.seats : []))
		.map((seat) => Number(seat?.price))
		.filter((price) => Number.isFinite(price) && price >= 0);

	if (prices.length === 0) return Number.POSITIVE_INFINITY;
	return Math.min(...prices);
};

const compareScheduleDeparture = (left, right) => {
	const leftMs = parseIsoDateTimeMs(left?.date, left?.time);
	const rightMs = parseIsoDateTimeMs(right?.date, right?.time);

	if (Number.isFinite(leftMs) && Number.isFinite(rightMs) && leftMs !== rightMs) {
		return leftMs - rightMs;
	}
	if (Number.isFinite(leftMs) && !Number.isFinite(rightMs)) return -1;
	if (!Number.isFinite(leftMs) && Number.isFinite(rightMs)) return 1;

	const leftTime = normalizeText(left?.time);
	const rightTime = normalizeText(right?.time);
	if (leftTime !== rightTime) {
		return leftTime.localeCompare(rightTime, undefined, { numeric: true, sensitivity: "base" });
	}

	return String(left?._id || "").localeCompare(String(right?._id || ""));
};

const buildSeatMetrics = ({ payload, schedule }) => {
	const fallbackTotal = getBusSeatCapacity(schedule?.bus);

	const totalSeatsRaw = Number(payload?.totalSeats);
	const totalSeats = Number.isFinite(totalSeatsRaw) && totalSeatsRaw > 0 ? Math.trunc(totalSeatsRaw) : fallbackTotal;

	const bookedSeats = Array.isArray(payload?.bookedSeats) ? payload.bookedSeats.length : 0;
	const lockedSeats = Array.isArray(payload?.lockedSeats) ? payload.lockedSeats.length : 0;
	const availableSeats = Math.max(totalSeats - bookedSeats, 0);

	return {
		totalSeats,
		bookedSeats,
		availableSeats,
		lockedSeats,
		bookedPercent: totalSeats > 0 ? Math.round((bookedSeats / totalSeats) * 100) : 0,
	};
};

const formatPointDateTime = (point) => {
	const pointDate = normalizeText(point?.date);
	const pointTime = normalizeText(point?.time);

	if (pointDate && pointTime) return `${pointDate} ${pointTime}`;
	if (pointDate) return pointDate;
	if (pointTime) return pointTime;
	return "Not set";
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
	const [selectedDates, setSelectedDates] = useState([]);
	const [time, setTime] = useState("");
	const [arrivalDate, setArrivalDate] = useState("");
	const [arrivalTime, setArrivalTime] = useState("");
	const [durationHours, setDurationHours] = useState("6");
	const [fieldErrors, setFieldErrors] = useState({});
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

	// all schedules section state
	const [scheduleSearchQuery, setScheduleSearchQuery] = useState("");
	const [scheduleDateFilter, setScheduleDateFilter] = useState("");
	const [scheduleStatusFilter, setScheduleStatusFilter] = useState("all");
	const [scheduleSortBy, setScheduleSortBy] = useState("departure");
	const [expandedRouteKey, setExpandedRouteKey] = useState("");
	const [selectedScheduleId, setSelectedScheduleId] = useState("");
	const [seatMetricsByScheduleId, setSeatMetricsByScheduleId] = useState({});
	const [seatMetricsLoadingByScheduleId, setSeatMetricsLoadingByScheduleId] = useState({});
	const [saveToast, setSaveToast] = useState(null);
	const saveToastTimerRef = useRef(null);
	const todayDateKey = useMemo(() => getTodayDateKey(), []);

	const showSaveToast = ({ kind = "success", title = "Saved", description = "" }) => {
		setSaveToast({ kind, title, description, id: Date.now() });
		if (saveToastTimerRef.current) window.clearTimeout(saveToastTimerRef.current);
		saveToastTimerRef.current = window.setTimeout(() => setSaveToast(null), 5200);
	};

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
	const selectedDurationMinutes = useMemo(() => {
		const parsedHours = Number(durationHours);
		if (!Number.isFinite(parsedHours) || parsedHours <= 0) return 0;
		return Math.round(parsedHours * 60);
	}, [durationHours]);

	const arrivalMs = useMemo(() => {
		if (!Number.isFinite(departureMs)) return NaN;
		if (selectedDurationMinutes > 0) {
			return departureMs + selectedDurationMinutes * 60 * 1000;
		}

		const aDateRaw = String(arrivalDate || "").trim();
		const aTimeRaw = String(arrivalTime || "").trim();
		if (aTimeRaw) {
			const baseDate = aDateRaw || String(date || "").trim();
			const ms = parseIsoDateTimeMs(baseDate, aTimeRaw);
			if (Number.isFinite(ms) && ms > departureMs) return ms;
		}

		return NaN;
	}, [arrivalDate, arrivalTime, date, departureMs, selectedDurationMinutes]);

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

	const normalizedScheduleSearch = useMemo(() => stopKey(scheduleSearchQuery), [scheduleSearchQuery]);

	const filteredSchedules = useMemo(() => {
		return (Array.isArray(schedules) ? schedules : []).filter((schedule) => {
			if (scheduleDateFilter && String(schedule?.date || "") !== scheduleDateFilter) return false;

			const isActive = schedule?.isActive !== false;
			if (scheduleStatusFilter === "active" && !isActive) return false;
			if (scheduleStatusFilter === "inactive" && isActive) return false;

			if (normalizedScheduleSearch) {
				const routeParts = getScheduleRouteLabelParts(schedule);
				const haystack = [
					String(schedule?.bus?.name || ""),
					String(schedule?.bus?.vehicleNumber || ""),
					routeParts.source,
					routeParts.destination,
				]
					.join(" ")
					.toLowerCase();

				if (!haystack.includes(normalizedScheduleSearch)) return false;
			}

			return true;
		});
	}, [normalizedScheduleSearch, scheduleDateFilter, scheduleStatusFilter, schedules]);

	const groupedSchedules = useMemo(() => {
		const groups = new Map();

		filteredSchedules.forEach((schedule) => {
			const routeParts = getScheduleRouteLabelParts(schedule);
			const routeId = String(schedule?.route?._id || schedule?.route || "").trim();
			const groupKey = routeId || `${routeParts.source}::${routeParts.destination}` || `schedule-${schedule?._id}`;

			if (!groups.has(groupKey)) {
				groups.set(groupKey, {
					key: groupKey,
					routeId,
					routeLabel: `${routeParts.source} -> ${routeParts.destination}`,
					source: routeParts.source,
					destination: routeParts.destination,
					schedules: [],
				});
			}

			groups.get(groupKey).schedules.push(schedule);
		});

		return Array.from(groups.values())
			.map((group) => {
				const sortedSchedules = [...group.schedules].sort((left, right) => {
					if (scheduleSortBy === "price") {
						const leftPrice = getSchedulePriceValue(left);
						const rightPrice = getSchedulePriceValue(right);
						if (leftPrice !== rightPrice) return leftPrice - rightPrice;
					}
					return compareScheduleDeparture(left, right);
				});

				const uniqueBuses = new Set(
					sortedSchedules
						.map((schedule) => String(schedule?.bus?._id || schedule?.bus || "").trim())
						.filter(Boolean)
				);

				const validPrices = sortedSchedules
					.map((schedule) => getSchedulePriceValue(schedule))
					.filter((price) => Number.isFinite(price) && price !== Number.POSITIVE_INFINITY);

				const averagePrice = validPrices.length > 0
					? validPrices.reduce((sum, price) => sum + price, 0) / validPrices.length
					: null;

				return {
					...group,
					schedules: sortedSchedules,
					summary: {
						totalSchedules: sortedSchedules.length,
						totalBuses: uniqueBuses.size,
						avgPrice: averagePrice,
					},
				};
			})
			.sort((left, right) => left.routeLabel.localeCompare(right.routeLabel, undefined, { sensitivity: "base" }));
	}, [filteredSchedules, scheduleSortBy]);

	const selectedSchedule = useMemo(
		() => schedules.find((schedule) => String(schedule?._id || "") === selectedScheduleId) || null,
		[schedules, selectedScheduleId]
	);

	const selectedScheduleRouteStops = useMemo(
		() => extractRouteStops(selectedSchedule),
		[selectedSchedule]
	);

	const selectedSeatMetrics = selectedScheduleId ? seatMetricsByScheduleId[selectedScheduleId] : null;
	const selectedSeatMetricsLoading = Boolean(selectedScheduleId && seatMetricsLoadingByScheduleId[selectedScheduleId]);

	const selectedSeatSnapshot = useMemo(() => {
		if (selectedSeatMetrics) return selectedSeatMetrics;
		return buildSeatMetrics({ payload: null, schedule: selectedSchedule });
	}, [selectedSchedule, selectedSeatMetrics]);

	const selectedBoardingPoints = useMemo(
		() => (Array.isArray(selectedSchedule?.boardingPoints) ? selectedSchedule.boardingPoints : []),
		[selectedSchedule]
	);

	const selectedDroppingPoints = useMemo(
		() => (Array.isArray(selectedSchedule?.droppingPoints) ? selectedSchedule.droppingPoints : []),
		[selectedSchedule]
	);

	useEffect(() => {
		if (!Number.isFinite(arrivalMs)) return;
		const nextDate = formatLocalDate(arrivalMs);
		const nextTime = formatLocalTime(arrivalMs);
		setArrivalDate((prev) => (prev === nextDate ? prev : nextDate));
		setArrivalTime((prev) => (prev === nextTime ? prev : nextTime));
	}, [arrivalMs]);

	const effectiveSelectedDates = useMemo(() => {
		if (isEditing) return date ? [date] : [];
		return sortDateKeys(selectedDates);
	}, [date, isEditing, selectedDates]);

	const selectedDatesSummary = useMemo(() => {
		if (isEditing) {
			return "Bulk date selection is available while creating a new schedule.";
		}

		if (effectiveSelectedDates.length === 0) {
			return "Select one or more dates from the calendar to create schedules in bulk.";
		}

		if (effectiveSelectedDates.length === 1) {
			return `1 schedule will be created for ${formatDisplayDate(effectiveSelectedDates[0])}.`;
		}

		return `${effectiveSelectedDates.length} schedules selected from ${formatDisplayDate(effectiveSelectedDates[0])} to ${formatDisplayDate(effectiveSelectedDates[effectiveSelectedDates.length - 1])}.`;
	}, [effectiveSelectedDates, isEditing]);

	const conflictWarnings = useMemo(() => {
		if (!busId || !time || selectedDurationMinutes <= 0 || effectiveSelectedDates.length === 0) return [];

		const candidateWindows = effectiveSelectedDates
			.map((dateKey) => {
				const startMs = parseIsoDateTimeMs(dateKey, time);
				if (!Number.isFinite(startMs)) return null;
				return {
					dateKey,
					startMs,
					endMs: startMs + selectedDurationMinutes * 60 * 1000,
				};
			})
			.filter(Boolean);

		if (candidateWindows.length === 0) return [];

		const busToken = String(busId).trim();
		const editToken = String(editingId || "").trim();
		const dedupe = new Set();
		const warnings = [];

		(Array.isArray(schedules) ? schedules : []).forEach((schedule) => {
			const scheduleBusId = String(schedule?.bus?._id || schedule?.bus || "").trim();
			if (!scheduleBusId || scheduleBusId !== busToken) return;

			const scheduleId = String(schedule?._id || "").trim();
			if (editToken && scheduleId === editToken) return;

			const existingStartMs = parseIsoDateTimeMs(schedule?.date, schedule?.time);
			const existingEndMs = resolveScheduleEndMs(schedule);
			if (!Number.isFinite(existingStartMs) || !Number.isFinite(existingEndMs) || existingEndMs <= existingStartMs) return;

			candidateWindows.forEach((candidate) => {
				const hasOverlap = candidate.startMs < existingEndMs && existingStartMs < candidate.endMs;
				if (!hasOverlap) return;

				const key = `${scheduleId}-${candidate.dateKey}`;
				if (dedupe.has(key)) return;
				dedupe.add(key);

				warnings.push({
					candidateDate: candidate.dateKey,
					existingDate: String(schedule?.date || ""),
					existingTime: String(schedule?.time || ""),
					routeLabel: getScheduleRouteLabel(schedule),
					scheduleId,
				});
			});
		});

		return warnings;
	}, [busId, editingId, effectiveSelectedDates, schedules, selectedDurationMinutes, time]);

	const conflictWarningsPreview = useMemo(() => conflictWarnings.slice(0, 6), [conflictWarnings]);
	const conflictDateKeys = useMemo(
		() => [...new Set(conflictWarnings.map((warning) => String(warning?.candidateDate || "").trim()).filter(Boolean))],
		[conflictWarnings]
	);

	const handleSelectedDatesChange = (nextDates) => {
		const normalizedDates = sortDateKeys(nextDates);
		setSelectedDates(normalizedDates);

		if (normalizedDates.length === 0) {
			setDate("");
			return;
		}

		setDate(normalizedDates[0]);
	};

	const resetForm = () => {
		setEditingId(null);
		setBusId("");
		setRouteId("");
		setDate("");
		setSelectedDates([]);
		setTime("");
		setArrivalDate("");
		setArrivalTime("");
		setDurationHours("6");
		setFieldErrors({});
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
			setSeatMetricsByScheduleId({});
			setSeatMetricsLoadingByScheduleId({});
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
		return () => {
			if (saveToastTimerRef.current) {
				window.clearTimeout(saveToastTimerRef.current);
			}
		};
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

	useEffect(() => {
		setFieldErrors((prev) => {
			if (!prev || Object.keys(prev).length === 0) return prev;
			const next = { ...prev };
			delete next.busId;
			delete next.routeId;
			delete next.date;
			delete next.selectedDates;
			delete next.time;
			delete next.durationHours;
			return next;
		});
	}, [busId, date, durationHours, routeId, selectedDates, time]);

	useEffect(() => {
		if (isEditing) return;
		if (selectedDates.length === 0) {
			if (date) setDate("");
			return;
		}

		const nextDate = selectedDates[0];
		if (date !== nextDate) setDate(nextDate);
	}, [date, isEditing, selectedDates]);

	const onSubmit = async (e) => {
		e.preventDefault();
		setError("");
		setFieldErrors({});
		setActionLoading(true);
		try {
			if (!selectedRoute || routeStopEntries.length === 0) {
				throw new Error("No route stops found. Configure stops in Stop Management before creating schedule.");
			}

			const validationErrors = {};
			if (!busId) validationErrors.busId = "Please select a bus.";
			if (!routeId) validationErrors.routeId = "Please select a route.";
			if (!time || !/^\d{2}:\d{2}$/.test(String(time || "").trim())) validationErrors.time = "Please choose a valid departure time.";
			if (selectedDurationMinutes <= 0) validationErrors.durationHours = "Enter a valid duration to calculate arrival time.";

			const createDates = isEditing ? (date ? [date] : []) : sortDateKeys(selectedDates);
			if (isEditing && createDates.length === 0) {
				validationErrors.date = "Please select a departure date.";
			}
			if (!isEditing && createDates.length === 0) {
				validationErrors.selectedDates = "Select at least one date before saving.";
			}

			if (!isEditing && createDates.some((dateKey) => parseDateKeyMs(dateKey) < parseDateKeyMs(todayDateKey))) {
				validationErrors.selectedDates = "Past dates cannot be selected for new schedules.";
			}

			if (Object.keys(validationErrors).length > 0) {
				setFieldErrors(validationErrors);
				throw new Error(Object.values(validationErrors)[0]);
			}

			const durationMinutesValue = selectedDurationMinutes;
			const templateDate = createDates[0];
			const templateDepartureMs = parseIsoDateTimeMs(templateDate, time);
			if (!Number.isFinite(templateDepartureMs)) {
				throw new Error("Departure date and time are required.");
			}

			const occurrenceDates = createDates;
			if (occurrenceDates.length === 0) {
				throw new Error("No valid schedule dates were selected.");
			}
			if (occurrenceDates.length > 60) {
				throw new Error("Bulk schedule creation is limited to 60 trips per save.");
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

			const toOffsetMinutes = (point) => {
				const pointMs = parseIsoDateTimeMs(point?.date, point?.time);
				if (!Number.isFinite(pointMs)) return 0;
				return Math.round((pointMs - templateDepartureMs) / (60 * 1000));
			};

			const boardingWithOffsets = payloadBoardingPoints.map((point) => ({
				...point,
				_offsetMinutes: toOffsetMinutes(point),
			}));
			const droppingWithOffsets = payloadDroppingPoints.map((point) => ({
				...point,
				_offsetMinutes: toOffsetMinutes(point),
			}));

			const shiftPointDates = (pointsWithOffsets, occurrenceStartMs) =>
				pointsWithOffsets.map((point) => {
					const offsetMinutes = Number(point?._offsetMinutes);
					const shiftedMs = occurrenceStartMs + (Number.isFinite(offsetMinutes) ? offsetMinutes : 0) * 60 * 1000;
					const { _offsetMinutes, ...payloadPoint } = point;
					return {
						...payloadPoint,
						date: formatLocalDate(shiftedMs),
						time: formatLocalTime(shiftedMs),
					};
				});

			const buildPayloadForDate = (occurrenceDate) => {
				const occurrenceStartMs = parseIsoDateTimeMs(occurrenceDate, time);
				if (!Number.isFinite(occurrenceStartMs)) {
					throw new Error(`Invalid departure date/time for generated occurrence: ${occurrenceDate} ${time}`);
				}

				const occurrenceArrivalMs = occurrenceStartMs + durationMinutesValue * 60 * 1000;

				return {
					bus: busId,
					route: routeId,
					date: occurrenceDate,
					time,
					arrivalDate: formatLocalDate(occurrenceArrivalMs),
					arrivalTime: formatLocalTime(occurrenceArrivalMs),
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
					boardingPoints: shiftPointDates(boardingWithOffsets, occurrenceStartMs),
					droppingPoints: shiftPointDates(droppingWithOffsets, occurrenceStartMs),
				};
			};

			if (isEditing) {
				await updateSchedule(editingId, buildPayloadForDate(date));
				showSaveToast({
					kind: "success",
					title: "Schedule saved",
					description: "Schedule updated successfully.",
				});
				resetForm();
				await loadAll();
			} else {
				const preDetectedConflictDates = new Set(
					conflictWarnings.map((warning) => String(warning?.candidateDate || "").trim()).filter(Boolean)
				);
				let createdCount = 0;
				const skippedConflictDates = new Set();
				const failedDates = [];

				for (const occurrenceDate of occurrenceDates) {
					if (preDetectedConflictDates.has(occurrenceDate)) {
						skippedConflictDates.add(occurrenceDate);
						continue;
					}

					try {
						await createSchedule(buildPayloadForDate(occurrenceDate));
						createdCount += 1;
					} catch (createError) {
						if (isConflictCreationError(createError)) {
							skippedConflictDates.add(occurrenceDate);
							continue;
						}

						failedDates.push({
							date: occurrenceDate,
							message: getApiErrorMessage(createError, "Create failed"),
						});
					}
				}

				const skippedConflictCount = skippedConflictDates.size;
				const failedCount = failedDates.length;

				if (createdCount === 0 && skippedConflictCount === 0 && failedCount > 0) {
					throw new Error(failedDates[0].message);
				}

				if (createdCount > 0) {
					resetForm();
					await loadAll();
				}

				const summaryParts = [];
				if (createdCount > 0) {
					summaryParts.push(`${createdCount} schedule${createdCount === 1 ? "" : "s"} created successfully.`);
				} else {
					summaryParts.push("No schedules were created.");
				}

				if (skippedConflictCount > 0) {
					summaryParts.push(`${skippedConflictCount} date${skippedConflictCount === 1 ? "" : "s"} skipped due to conflicts.`);
				}

				if (failedCount > 0) {
					summaryParts.push(`${failedCount} date${failedCount === 1 ? "" : "s"} failed due to other errors.`);
					setError(`Some dates could not be created. First failure on ${failedDates[0].date}: ${failedDates[0].message}`);
				}

				showSaveToast({
					kind: createdCount > 0 && skippedConflictCount === 0 && failedCount === 0 ? "success" : "warning",
					title: "Bulk save summary",
					description: summaryParts.join(" "),
				});
			}
		} catch (err) {
			setError(getApiErrorMessage(err, isEditing ? "Update failed" : "Create failed"));
		} finally {
			setActionLoading(false);
		}
	};

	const onEdit = (sch) => {
		setEditingId(sch._id);
		setFieldErrors({});
		setBusId(sch.bus?._id || sch.bus || "");
		setRouteId(sch.route?._id || sch.route || "");
		setDate(sch.date || "");
		setSelectedDates(sch.date ? [sch.date] : []);
		setTime(sch.time || "");
		setArrivalDate(sch.arrivalDate || "");
		setArrivalTime(sch.arrivalTime || "");
		if (sch.durationMinutes !== undefined && sch.durationMinutes !== null && sch.durationMinutes !== "") {
			const hours = Number(sch.durationMinutes) / 60;
			setDurationHours(Number.isFinite(hours) ? String(Math.round(hours * 100) / 100) : "6");
		} else {
			const startMs = parseIsoDateTimeMs(sch.date, sch.time);
			const endMs = parseIsoDateTimeMs(sch.arrivalDate || sch.date, sch.arrivalTime);
			if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
				const hours = (endMs - startMs) / (60 * 60 * 1000);
				setDurationHours(String(Math.round(hours * 100) / 100));
			} else {
				setDurationHours("6");
			}
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

	const loadSeatMetricsForSchedules = async (routeSchedules) => {
		const pendingSchedules = (Array.isArray(routeSchedules) ? routeSchedules : []).filter((schedule) => {
			const id = String(schedule?._id || "").trim();
			if (!id) return false;
			if (seatMetricsByScheduleId[id]) return false;
			if (seatMetricsLoadingByScheduleId[id]) return false;
			return true;
		});

		if (pendingSchedules.length === 0) return;

		setSeatMetricsLoadingByScheduleId((previous) => {
			const next = { ...previous };
			pendingSchedules.forEach((schedule) => {
				next[String(schedule._id)] = true;
			});
			return next;
		});

		try {
			const results = await Promise.all(
				pendingSchedules.map(async (schedule) => {
					const id = String(schedule._id);
					try {
						const payload = await getSeatStatus(id);
						return {
							id,
							metrics: buildSeatMetrics({ payload, schedule }),
						};
					} catch (seatStatusError) {
						return {
							id,
							metrics: {
								...buildSeatMetrics({ payload: null, schedule }),
								error: seatStatusError?.response?.data?.message || seatStatusError?.message || "Failed to load seat status",
							},
						};
					}
				})
			);

			setSeatMetricsByScheduleId((previous) => {
				const next = { ...previous };
				results.forEach((result) => {
					next[result.id] = result.metrics;
				});
				return next;
			});
		} finally {
			setSeatMetricsLoadingByScheduleId((previous) => {
				const next = { ...previous };
				pendingSchedules.forEach((schedule) => {
					delete next[String(schedule._id)];
				});
				return next;
			});
		}
	};

	const handleToggleRouteGroup = (group) => {
		const shouldExpand = expandedRouteKey !== group.key;
		setExpandedRouteKey(shouldExpand ? group.key : "");

		if (shouldExpand) {
			// Lazy-load seat status only for schedules in the expanded route.
			void loadSeatMetricsForSchedules(group.schedules);
		}
	};

	const openScheduleDetails = (schedule) => {
		const id = String(schedule?._id || "").trim();
		if (!id) return;
		setSelectedScheduleId(id);
		void loadSeatMetricsForSchedules([schedule]);
	};

	const resetScheduleFilters = () => {
		setScheduleSearchQuery("");
		setScheduleDateFilter("");
		setScheduleStatusFilter("all");
		setScheduleSortBy("departure");
	};

	useEffect(() => {
		if (groupedSchedules.length === 0) {
			setExpandedRouteKey("");
			return;
		}

		if (!groupedSchedules.some((group) => group.key === expandedRouteKey)) {
			setExpandedRouteKey(groupedSchedules[0].key);
		}
	}, [expandedRouteKey, groupedSchedules]);

	useEffect(() => {
		if (!expandedRouteKey) return;
		const expandedGroup = groupedSchedules.find((group) => group.key === expandedRouteKey);
		if (!expandedGroup) return;
		void loadSeatMetricsForSchedules(expandedGroup.schedules);
	}, [expandedRouteKey, groupedSchedules]);

	useEffect(() => {
		if (selectedScheduleId && !selectedSchedule) {
			setSelectedScheduleId("");
		}
	}, [selectedSchedule, selectedScheduleId]);

	return (
		<div className="mx-auto max-w-6xl px-4 py-10">
			{saveToast ? (
				<div className="pointer-events-none fixed right-4 top-4 z-70 w-[min(92vw,28rem)]">
					<div
						className={[
							"pointer-events-auto rounded-2xl border px-4 py-3 shadow-xl",
							saveToast.kind === "warning"
								? "border-amber-200 bg-amber-50"
								: saveToast.kind === "error"
									? "border-red-200 bg-red-50"
									: "border-emerald-200 bg-emerald-50",
						].join(" ")}
					>
						<div className="flex items-start justify-between gap-3">
							<div>
								<div
									className={[
										"text-sm font-semibold",
										saveToast.kind === "warning"
											? "text-amber-900"
											: saveToast.kind === "error"
												? "text-red-900"
												: "text-emerald-900",
									].join(" ")}
								>
									{saveToast.title}
								</div>
								{saveToast.description ? (
									<div
										className={[
											"mt-1 text-xs leading-relaxed",
											saveToast.kind === "warning"
												? "text-amber-800"
												: saveToast.kind === "error"
													? "text-red-800"
													: "text-emerald-800",
										].join(" ")}
									>
										{saveToast.description}
									</div>
								) : null}
							</div>
							<button
								type="button"
								onClick={() => {
									setSaveToast(null);
									if (saveToastTimerRef.current) window.clearTimeout(saveToastTimerRef.current);
								}}
								className="rounded-lg border border-slate-300/70 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 transition hover:bg-slate-50"
							>
								Close
							</button>
						</div>
					</div>
				</div>
			) : null}

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

					<div className="mt-6 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm sm:p-6">
						<form onSubmit={onSubmit} className="space-y-5">
							<div className="grid gap-5 xl:grid-cols-2">
								<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
									<div className="flex items-center justify-between gap-3">
										<div>
											<div className="text-sm font-bold text-slate-900">Route Assignment</div>
											<p className="mt-1 text-xs text-slate-500">Choose the bus, route, and exact service dates for this trip.</p>
										</div>
										{selectedRoute ? (
											<span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600">
												{routeStopEntries.length} route stops
											</span>
										) : null}
									</div>

									<div className="mt-4 grid gap-4 md:grid-cols-2">
										<div>
											<label className="block text-sm font-semibold text-slate-700">Bus</label>
											<select
												value={busId}
												onChange={(e) => setBusId(e.target.value)}
												required
												className={[
													"mt-2 w-full rounded-xl border bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none transition",
													fieldErrors.busId
														? "border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100"
														: "border-slate-200 hover:border-orange-300 focus:border-orange-300 focus:ring-2 focus:ring-orange-100",
												].join(" ")}
											>
												<option value="">Select bus</option>
												{buses.map((b) => (
													<option key={b._id} value={b._id}>
														{b.name} ({getBusTypeSummary(b, 2)})
													</option>
												))}
											</select>
											{fieldErrors.busId ? <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors.busId}</p> : null}
										</div>

										<div>
											<label className="block text-sm font-semibold text-slate-700">Route</label>
											<select
												value={routeId}
												onChange={(e) => {
													setRouteId(e.target.value);
													setBoardingPoints([]);
													setDroppingPoints([]);
												}}
												required
												className={[
													"mt-2 w-full rounded-xl border bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none transition",
													fieldErrors.routeId
														? "border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100"
														: "border-slate-200 hover:border-orange-300 focus:border-orange-300 focus:ring-2 focus:ring-orange-100",
												].join(" ")}
											>
												<option value="">Select route</option>
												{routes.map((r) => (
													<option key={r._id} value={r._id}>
														{r.source} → {r.destination}
													</option>
												))}
											</select>
											{fieldErrors.routeId ? <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors.routeId}</p> : null}
										</div>
									</div>

									<div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
										<div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Specific Service Dates</div>
										<p className="mt-2 text-xs text-slate-600">{selectedDatesSummary}</p>
										<div className="mt-3">
											<MultiDatePicker
												selectedDates={effectiveSelectedDates}
												onChange={handleSelectedDatesChange}
												minDate={isEditing ? undefined : todayDateKey}
												conflictDates={conflictDateKeys}
												disabled={isEditing}
												error={fieldErrors.selectedDates}
											/>
										</div>
										{isEditing ? (
											<p className="mt-2 text-xs text-slate-500">Bulk date toggling is disabled while editing an existing schedule.</p>
										) : null}
									</div>

									{conflictWarnings.length > 0 ? (
										<div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3">
											<div className="text-xs font-semibold uppercase tracking-wide text-amber-800">Conflict Detection</div>
											<p className="mt-1 text-xs text-amber-700">This bus appears assigned to overlapping schedules at selected times.</p>
											<ul className="mt-2 space-y-1 text-xs text-amber-800">
												{conflictWarningsPreview.map((warning) => (
													<li key={`${warning.scheduleId}-${warning.candidateDate}`} className="rounded-lg border border-amber-200 bg-white/80 px-2 py-1">
														{formatDisplayDate(warning.candidateDate)} overlaps with {warning.routeLabel} ({formatDisplayDate(warning.existingDate)} at {formatDisplayTime(warning.existingTime)})
													</li>
												))}
											</ul>
											{conflictWarnings.length > conflictWarningsPreview.length ? (
												<div className="mt-2 text-[11px] font-semibold text-amber-700">
													+{conflictWarnings.length - conflictWarningsPreview.length} more conflict dates detected.
												</div>
											) : null}
										</div>
									) : null}
								</div>

								<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
									<div>
										<div className="text-sm font-bold text-slate-900">Timing & Arrival Calculator</div>
										<p className="mt-1 text-xs text-slate-500">Use calendar and segmented time controls for precise departure planning.</p>
									</div>

									<div className="mt-4 space-y-4">
										<div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-3">
											<div className="text-xs font-semibold uppercase tracking-wide text-blue-700">Primary Departure Date</div>
											<div className="mt-1 text-sm font-semibold text-blue-900">
												{date ? formatDisplayDate(date) : "Select at least one date from the calendar."}
											</div>
											<p className="mt-1 text-[11px] text-blue-800">
												Boarding and dropping offsets are captured from this date and shifted for each selected service date.
											</p>
											{fieldErrors.date ? <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors.date}</p> : null}
										</div>

										<SegmentedTimePicker
											label="Departure Time"
											value={time}
											onChange={setTime}
											error={fieldErrors.time}
											helperText="24-hour value is saved automatically in backend format."
											required
											idPrefix="schedule-departure-time"
										/>

										<div>
											<div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Quick Templates</div>
											<div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
												{DEPARTURE_TEMPLATES.map((template) => (
													<button
														key={template.label}
														type="button"
														onClick={() => {
															setTime(template.time);
															setDurationHours(template.durationHours);
														}}
														className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"
													>
														{template.label}
														<span className="ml-1 text-[11px] font-medium text-slate-500">{formatDisplayTime(template.time)}</span>
													</button>
												))}
											</div>
										</div>

										<div>
											<label className="block text-sm font-semibold text-slate-700">Duration (hours)</label>
											<input
												type="number"
												min={0.25}
												step={0.25}
												value={durationHours}
												onChange={(e) => setDurationHours(e.target.value)}
												placeholder="e.g., 6"
												className={[
													"mt-2 w-full rounded-xl border bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none transition",
													fieldErrors.durationHours
														? "border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100"
														: "border-slate-200 hover:border-orange-300 focus:border-orange-300 focus:ring-2 focus:ring-orange-100",
												].join(" ")}
											/>
											<div className="mt-2 flex flex-wrap gap-2">
												{DURATION_PRESET_HOURS.map((preset) => (
													<button
														key={preset}
														type="button"
														onClick={() => setDurationHours(preset)}
														className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-orange-300 hover:text-orange-700"
													>
														{preset}h
													</button>
												))}
											</div>
											{fieldErrors.durationHours ? <p className="mt-1 text-xs font-medium text-red-600">{fieldErrors.durationHours}</p> : <p className="mt-2 text-xs text-slate-500">Arrival updates automatically from departure + duration.</p>}
										</div>

										<div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3">
											<div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Calculated Arrival</div>
											<div className="mt-1 text-sm font-semibold text-emerald-900">
												{Number.isFinite(arrivalMs) ? `${formatDisplayDate(arrivalDate)} at ${formatDisplayTime(arrivalTime)}` : "Select departure date/time and duration"}
											</div>
										</div>

										<div className="pt-1">
											<label className="inline-flex select-none items-center gap-2 text-sm font-semibold text-slate-700">
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

					<div className="mt-10">
						<div>
							<div className="text-lg font-extrabold text-slate-900">All Schedules</div>
							<p className="mt-1 text-sm text-slate-600">Grouped by route for faster schedule management at scale.</p>
						</div>

						<div className="mt-4">
							<ScheduleFilters
								searchQuery={scheduleSearchQuery}
								onSearchQueryChange={setScheduleSearchQuery}
								dateFilter={scheduleDateFilter}
								onDateFilterChange={setScheduleDateFilter}
								statusFilter={scheduleStatusFilter}
								onStatusFilterChange={setScheduleStatusFilter}
								sortBy={scheduleSortBy}
								onSortByChange={setScheduleSortBy}
								onReset={resetScheduleFilters}
								totalCount={schedules.length}
								visibleCount={filteredSchedules.length}
							/>
						</div>

						<div className="mt-4 space-y-4">
							{groupedSchedules.length === 0 ? (
								<div className="rounded-2xl border border-slate-200 bg-white px-4 py-10 text-center text-sm font-medium text-slate-600 shadow-sm">
									No schedules available
								</div>
							) : (
								groupedSchedules.map((group) => (
									<RouteScheduleGroup
										key={group.key}
										group={group}
										isExpanded={expandedRouteKey === group.key}
										onToggle={handleToggleRouteGroup}
									>
										{group.schedules.length === 0 ? (
											<div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
												No schedules available for this route.
											</div>
										) : (
											<div className="grid gap-4 xl:grid-cols-2">
												{group.schedules.map((schedule) => {
													const scheduleId = String(schedule?._id || "").trim();
													return (
														<ScheduleCard
															key={scheduleId}
															schedule={schedule}
															fareLabel={getScheduleFareSummary(schedule)}
															seatMetrics={seatMetricsByScheduleId[scheduleId]}
															isSeatLoading={Boolean(seatMetricsLoadingByScheduleId[scheduleId])}
															actionLoading={actionLoading}
															onEdit={() => onEdit(schedule)}
															onDelete={() => onDelete(scheduleId)}
															onViewDetails={() => openScheduleDetails(schedule)}
														/>
													);
												})}
											</div>
										)}
									</RouteScheduleGroup>
								))
							)}
						</div>
					</div>

					{selectedSchedule ? (
						<div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 px-4 py-6">
							<div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6">
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div>
										<h3 className="text-xl font-bold text-slate-900">Schedule Details</h3>
										<p className="mt-1 text-sm text-slate-600">{getScheduleRouteLabel(selectedSchedule)}</p>
									</div>
									<button
										type="button"
										onClick={() => setSelectedScheduleId("")}
										className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
									>
										Close
									</button>
								</div>

								<div className="mt-5 grid gap-4 lg:grid-cols-2">
									<div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
										<div className="text-sm font-semibold text-slate-900">Route Stops</div>
										{selectedScheduleRouteStops.length === 0 ? (
											<div className="mt-2 text-sm text-slate-600">No route stops available.</div>
										) : (
											<ol className="mt-3 space-y-2 text-sm text-slate-700">
												{selectedScheduleRouteStops.map((stop, index) => (
													<li key={`${stop}-${index}`} className="flex items-center gap-2">
														<span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
															{index + 1}
														</span>
														<span>{stop}</span>
													</li>
												))}
											</ol>
										)}
									</div>

									<div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
										<div className="text-sm font-semibold text-slate-900">Booking and Seat Availability</div>
										<div className="mt-3 grid grid-cols-2 gap-2 text-xs">
											<div className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-slate-700">
												<div className="font-semibold text-slate-900">Status</div>
												<div>{selectedSchedule?.isActive === false ? "Inactive" : "Active"}</div>
											</div>
											<div className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-slate-700">
												<div className="font-semibold text-slate-900">Fare</div>
												<div>{getScheduleFareSummary(selectedSchedule)}</div>
											</div>
											<div className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-slate-700">
												<div className="font-semibold text-slate-900">Total seats</div>
												<div>{selectedSeatSnapshot.totalSeats}</div>
											</div>
											<div className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-slate-700">
												<div className="font-semibold text-slate-900">Booked seats</div>
												<div>{selectedSeatSnapshot.bookedSeats}</div>
											</div>
											<div className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-slate-700">
												<div className="font-semibold text-slate-900">Available seats</div>
												<div>{selectedSeatSnapshot.availableSeats}</div>
											</div>
											<div className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-slate-700">
												<div className="font-semibold text-slate-900">Locked seats</div>
												<div>{selectedSeatSnapshot.lockedSeats}</div>
											</div>
										</div>

										<div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-200">
											<div
												className="h-full rounded-full bg-sky-500 transition-all"
												style={{ width: `${selectedSeatSnapshot.bookedPercent}%` }}
											/>
										</div>
										<div className="mt-2 text-xs font-medium text-slate-600">
											{selectedSeatSnapshot.bookedPercent}% booked
										</div>
										{selectedSeatMetricsLoading ? <div className="mt-2 text-xs text-slate-500">Refreshing seat status...</div> : null}
										{selectedSeatMetrics?.error ? <div className="mt-1 text-xs text-amber-700">{selectedSeatMetrics.error}</div> : null}
									</div>
								</div>

								<div className="mt-4 grid gap-4 lg:grid-cols-2">
									<div className="rounded-xl border border-slate-200 bg-white p-4">
										<div className="text-sm font-semibold text-slate-900">Boarding Points</div>
										{selectedBoardingPoints.length === 0 ? (
											<div className="mt-2 text-sm text-slate-600">No boarding points configured.</div>
										) : (
											<ul className="mt-2 space-y-1.5 text-sm text-slate-700">
												{selectedBoardingPoints.map((point, index) => (
													<li key={`boarding-${String(point?.name || "point")}-${index}`} className="flex items-center justify-between gap-2">
														<span>{normalizeText(point?.name) || "Unnamed"}</span>
														<span className="text-xs text-slate-500">{formatPointDateTime(point)}</span>
													</li>
												))}
											</ul>
										)}
									</div>

									<div className="rounded-xl border border-slate-200 bg-white p-4">
										<div className="text-sm font-semibold text-slate-900">Dropping Points</div>
										{selectedDroppingPoints.length === 0 ? (
											<div className="mt-2 text-sm text-slate-600">No dropping points configured.</div>
										) : (
											<ul className="mt-2 space-y-1.5 text-sm text-slate-700">
												{selectedDroppingPoints.map((point, index) => (
													<li key={`dropping-${String(point?.name || "point")}-${index}`} className="flex items-center justify-between gap-2">
														<span>{normalizeText(point?.name) || "Unnamed"}</span>
														<span className="text-xs text-slate-500">{formatPointDateTime(point)}</span>
													</li>
												))}
											</ul>
										)}
									</div>
								</div>
							</div>
						</div>
					) : null}
				</>
			)}
		</div>
	);
}
