import { AnimatePresence, motion } from "framer-motion";
import {
  BusFront,
  Filter,
  Route as RouteIcon,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import BusResultCard from "../../components/search/BusResultCard";
import FilterSidebar from "../../components/search/FilterSidebar";
import LocationAutocompleteInput from "../../components/search/LocationAutocompleteInput";
import FilterTagList from "../../components/search/FilterTagList";
import SearchHeader from "../../components/search/SearchHeader";
import { searchSchedules } from "../../services/booking.service";
import { getBusTypeLabels } from "../../utils/busTypeUtils";
import { toAbsoluteAssetUrl } from "../../utils/helpers";

const SORT_OPTIONS = [
  { value: "recommended", label: "Recommended" },
  { value: "price-asc", label: "Price low to high" },
  { value: "price-desc", label: "Price high to low" },
  { value: "departure-early", label: "Departure early" },
  { value: "departure-late", label: "Departure late" },
];

const STATIC_FILTER_OPTIONS = {
  busTypes: [
    { value: "ac", label: "AC" },
    { value: "non-ac", label: "Non-AC" },
    { value: "sleeper", label: "Sleeper" },
    { value: "seater", label: "Seater" },
    { value: "sofa-seater", label: "Sofa Seater" },
  ],
  shifts: [
    { value: "day", label: "Day" },
    { value: "night", label: "Night" },
  ],
  departureWindows: [
    { value: "before-6", label: "Before 6 AM", start: 0, end: 360 },
    { value: "6-12", label: "6 AM - 12 PM", start: 360, end: 720 },
    { value: "12-18", label: "12 PM - 6 PM", start: 720, end: 1080 },
    { value: "after-18", label: "After 6 PM", start: 1080, end: 1440 },
  ],
  vehicleTypes: [
    { value: "deluxe", label: "Deluxe" },
    { value: "tourist", label: "Tourist" },
    { value: "vip", label: "VIP" },
  ],
  seatTypes: [
    { value: "seater", label: "Seater" },
    { value: "sleeper", label: "Sleeper" },
    { value: "shared-sleeper", label: "Shared Sleeper" },
  ],
  facilities: [
    { value: "ac", label: "AC" },
    { value: "charging-port", label: "Charging" },
    { value: "wifi", label: "WiFi" },
    { value: "water-bottle", label: "Water" },
  ],
};

const INITIAL_FILTERS = {
  busTypes: [],
  shifts: [],
  departureWindows: [],
  operators: [],
  vehicleTypes: [],
  seatTypes: [],
  facilities: [],
  priceRange: [0, 0],
  refundableOnly: false,
  boardingPoints: [],
  droppingPoints: [],
};

const normalize = (value) => String(value || "").trim().toLowerCase();
const normalizeToken = (value) => normalize(value).replace(/[\s_]+/g, "-");

const uniqueSorted = (values) => {
  const set = new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean));
  return Array.from(set).sort((a, b) => a.localeCompare(b));
};

const parseTimeToMinutes = (raw) => {
  const text = String(raw || "").trim();
  if (!text) return null;

  const ampmMatch = text.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (ampmMatch) {
    let hour = Number(ampmMatch[1]);
    const minute = Number(ampmMatch[2]);
    const suffix = ampmMatch[3].toUpperCase();

    if (!Number.isFinite(hour) || !Number.isFinite(minute) || minute > 59) return null;
    if (hour === 12) hour = 0;
    if (suffix === "PM") hour += 12;
    return hour * 60 + minute;
  }

  const plainMatch = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!plainMatch) return null;

  const hour = Number(plainMatch[1]);
  const minute = Number(plainMatch[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
};

const formatTime = (raw) => {
  const minutes = parseTimeToMinutes(raw);
  if (minutes === null) return String(raw || "--");

  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
};

const formatDateLabel = (date) => {
  const safe = String(date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safe)) return safe || "Any Date";

  const parsed = new Date(`${safe}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return safe;

  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
};

const formatDuration = (schedule, departureMinutes, arrivalMinutes) => {
  const explicit = Number(schedule?.durationMinutes);
  if (Number.isFinite(explicit) && explicit > 0) {
    const hours = Math.floor(explicit / 60);
    const minutes = Math.round(explicit % 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  }

  if (departureMinutes === null || arrivalMinutes === null) return "Duration N/A";

  let delta = arrivalMinutes - departureMinutes;
  if (delta < 0) delta += 24 * 60;
  const hours = Math.floor(delta / 60);
  const minutes = delta % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
};

const getStartingPrice = (schedule) => {
  const schedulePrice = Number(schedule?.price);
  if (Number.isFinite(schedulePrice) && schedulePrice > 0) return schedulePrice;

  const deckSeatPrices = (Array.isArray(schedule?.bus?.decks) ? schedule.bus.decks : [])
    .flatMap((deck) => (Array.isArray(deck?.seats) ? deck.seats : []))
    .map((seat) => Number(seat?.price))
    .filter((price) => Number.isFinite(price) && price > 0);

  if (!deckSeatPrices.length) return 0;
  return Math.min(...deckSeatPrices);
};

const buildAmenities = (schedule) => {
  const set = new Set();

  (Array.isArray(schedule?.amenities) ? schedule.amenities : []).forEach((amenity) => {
    const token = normalizeToken(amenity);
    if (!token) return;
    set.add(token);
  });

  getBusTypeLabels(schedule?.bus).forEach((typeLabel) => {
    const token = normalizeToken(typeLabel);
    if (!token) return;
    set.add(token);
  });

  return Array.from(set);
};

const buildPolicies = (schedule) => {
  const list = [];

  if (schedule?.refundable === true) {
    list.push("Refundable ticket available");
  }

  const policyBag = schedule?.bus?.policies || schedule?.policies || {};
  [policyBag.refundPolicy, policyBag.cancellationPolicy, policyBag.dateChangePolicy, policyBag.luggagePolicy]
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .forEach((policy) => list.push(policy));

  return uniqueSorted(list);
};

const normalizeSeatTypeToken = (value) => normalizeToken(value).replace(/^shared-/, "shared-");

const getSeatTypeTokens = (schedule) => {
  const seatTypesFromDecks = (Array.isArray(schedule?.bus?.decks) ? schedule.bus.decks : [])
    .flatMap((deck) => (Array.isArray(deck?.seats) ? deck.seats : []))
    .map((seat) => normalizeSeatTypeToken(seat?.seatType))
    .filter(Boolean);

  if (seatTypesFromDecks.length) return uniqueSorted(seatTypesFromDecks);

  return getBusTypeLabels(schedule?.bus)
    .map((label) => normalizeSeatTypeToken(label))
    .filter(Boolean);
};

const getVehicleTypeToken = (schedule) => {
  const busNameToken = normalizeToken(schedule?.bus?.name);
  const busTypeToken = normalizeToken(schedule?.bus?.type);

  if (busNameToken.includes("tourist") || busTypeToken.includes("tourist")) return "tourist";
  if (busNameToken.includes("vip") || busTypeToken.includes("vip")) return "vip";
  if (busNameToken.includes("electric") || busTypeToken.includes("electric")) return "electric";
  return "deluxe";
};

const mapScheduleToViewModel = (schedule) => {
  const departureMinutes = parseTimeToMinutes(schedule?.time);
  const arrivalMinutes = parseTimeToMinutes(schedule?.arrivalTime);
  const departureLabel = formatTime(schedule?.time);
  const arrivalLabel = formatTime(schedule?.arrivalTime || "");
  const durationLabel = formatDuration(schedule, departureMinutes, arrivalMinutes);

  const availableSeats = Number(schedule?.bus?.totalSeats) || 0;
  const busName = String(schedule?.bus?.name || "Bus").trim() || "Bus";
  const source = String(schedule?.route?.source || "").trim() || "Unknown";
  const destination = String(schedule?.route?.destination || "").trim() || "Unknown";
  const busTypeLabels = getBusTypeLabels(schedule?.bus);
  const amenities = buildAmenities(schedule);
  const policies = buildPolicies(schedule);

  const operatorName =
    String(schedule?.bus?.operator?.name || "").trim() ||
    String(schedule?.bus?.operator?.email || "").trim() ||
    "Unknown Operator";

  const boardingPoints = (Array.isArray(schedule?.boardingPoints) ? schedule.boardingPoints : [])
    .map((point) => ({
      name: String(point?.name || "").trim(),
      time: String(point?.time || "").trim(),
    }))
    .filter((point) => point.name);

  const droppingPoints = (Array.isArray(schedule?.droppingPoints) ? schedule.droppingPoints : [])
    .map((point) => ({
      name: String(point?.name || "").trim(),
      time: String(point?.time || "").trim(),
    }))
    .filter((point) => point.name);

  const startingPrice = getStartingPrice(schedule);

  return {
    id: schedule?._id,
    raw: schedule,
    busName,
    source,
    destination,
    date: String(schedule?.date || "").trim(),
    dateLabel: formatDateLabel(schedule?.date),
    departureMinutes,
    departureLabel,
    arrivalMinutes,
    arrivalLabel,
    durationLabel,
    durationMinutes: Number(schedule?.durationMinutes) || null,
    availableSeats,
    startingPrice,
    imageUrl: toAbsoluteAssetUrl(schedule?.bus?.imageUrl),
    busTypeLabels,
    seatTypeTokens: getSeatTypeTokens(schedule),
    shift: departureMinutes !== null && (departureMinutes >= 1080 || departureMinutes < 360) ? "night" : "day",
    refundable: schedule?.refundable === true,
    operatorName,
    vehicleType: getVehicleTypeToken(schedule),
    amenities,
    policies,
    boardingPoints,
    droppingPoints,
  };
};

const matchesTextOption = (haystackValues, requiredTokens) => {
  if (!requiredTokens.length) return true;

  const normalizedHaystack = haystackValues.map((item) => normalizeToken(item));
  return requiredTokens.some((token) => normalizedHaystack.some((value) => value.includes(token)));
};

export default function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const initialSource = searchParams.get("source") || "";
  const initialDestination = searchParams.get("destination") || "";
  const initialDateParam = searchParams.get("date") || "";
  const initialDate = initialDateParam || "";
  const initialHasAnyParam = Boolean(initialSource || initialDestination || initialDateParam);

  const [source, setSource] = useState(initialSource);
  const [destination, setDestination] = useState(initialDestination);
  const [date, setDate] = useState(initialDate);

  const [rawSchedules, setRawSchedules] = useState([]);
  const [loading, setLoading] = useState(initialHasAnyParam);
  const [error, setError] = useState("");
  const [hasSearched, setHasSearched] = useState(initialHasAnyParam);

  const [sortBy, setSortBy] = useState("recommended");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const [filters, setFilters] = useState(INITIAL_FILTERS);

  const runSearch = async ({ sourceValue, destinationValue, dateValue, syncQuery = true }) => {
    setError("");
    setHasSearched(true);
    setLoading(true);

    try {
      const payload = {
        source: String(sourceValue || "").trim() || undefined,
        destination: String(destinationValue || "").trim() || undefined,
        date: String(dateValue || "").trim() || undefined,
      };

      if (syncQuery) {
        const query = {};
        if (payload.source) query.source = payload.source;
        if (payload.destination) query.destination = payload.destination;
        if (payload.date) query.date = payload.date;
        setSearchParams(query, { replace: true });
      }

      const schedules = await searchSchedules(payload);
      const data = Array.isArray(schedules) ? schedules : [];
      setRawSchedules(data);

      const priceValues = data
        .map((schedule) => getStartingPrice(schedule))
        .filter((price) => Number.isFinite(price) && price >= 0);

      const minPrice = priceValues.length ? Math.min(...priceValues) : 0;
      const maxPrice = priceValues.length ? Math.max(...priceValues) : minPrice;

      setFilters((prev) => ({ ...prev, priceRange: [minPrice, maxPrice] }));
    } catch (err) {
      setRawSchedules([]);
      setError(err?.response?.data?.message || err.message || "Search failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const hasAnyParam = searchParams.has("source") || searchParams.has("destination") || searchParams.has("date");
    if (!hasAnyParam) return;

    const sourceValue = searchParams.get("source") || "";
    const destinationValue = searchParams.get("destination") || "";
    const dateValue = searchParams.get("date") || "";

    setSource(sourceValue);
    setDestination(destinationValue);
    setDate(dateValue);

    // eslint-disable-next-line no-void
    void runSearch({ sourceValue, destinationValue, dateValue, syncQuery: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mappedResults = useMemo(() => rawSchedules.map(mapScheduleToViewModel), [rawSchedules]);

  const dynamicFilterOptions = useMemo(() => {
    const operators = uniqueSorted(mappedResults.map((item) => item.operatorName));
    const boardingPoints = uniqueSorted(mappedResults.flatMap((item) => item.boardingPoints.map((point) => point.name)));
    const droppingPoints = uniqueSorted(mappedResults.flatMap((item) => item.droppingPoints.map((point) => point.name)));

    const priceValues = mappedResults
      .map((item) => Number(item.startingPrice))
      .filter((price) => Number.isFinite(price) && price >= 0);

    const min = priceValues.length ? Math.min(...priceValues) : 0;
    const max = priceValues.length ? Math.max(...priceValues) : min;

    return {
      ...STATIC_FILTER_OPTIONS,
      operators,
      boardingPoints,
      droppingPoints,
      priceBounds: { min, max },
    };
  }, [mappedResults]);

  const filteredResults = useMemo(() => {
    const selectedBusTypeTokens = filters.busTypes;
    const selectedVehicleTypeTokens = filters.vehicleTypes;
    const selectedSeatTypeTokens = filters.seatTypes;
    const selectedFacilityTokens = filters.facilities;

    const selectedDepartureWindows = filters.departureWindows
      .map((token) => STATIC_FILTER_OPTIONS.departureWindows.find((window) => window.value === token))
      .filter(Boolean);

    return mappedResults.filter((item) => {
      if (filters.operators.length > 0 && !filters.operators.includes(item.operatorName)) return false;
      if (filters.shifts.length > 0 && !filters.shifts.includes(item.shift)) return false;
      if (filters.refundableOnly && !item.refundable) return false;

      if (filters.boardingPoints.length > 0) {
        const boardingNames = item.boardingPoints.map((point) => point.name);
        if (!filters.boardingPoints.some((point) => boardingNames.includes(point))) return false;
      }

      if (filters.droppingPoints.length > 0) {
        const droppingNames = item.droppingPoints.map((point) => point.name);
        if (!filters.droppingPoints.some((point) => droppingNames.includes(point))) return false;
      }

      if (!matchesTextOption(item.busTypeLabels, selectedBusTypeTokens)) return false;
      if (!matchesTextOption([item.vehicleType], selectedVehicleTypeTokens)) return false;
      if (!matchesTextOption(item.seatTypeTokens, selectedSeatTypeTokens)) return false;
      if (!matchesTextOption(item.amenities, selectedFacilityTokens)) return false;

      if (selectedDepartureWindows.length > 0) {
        if (item.departureMinutes === null) return false;
        const inAnyWindow = selectedDepartureWindows.some((window) => {
          if (window.value === "after-18") return item.departureMinutes >= window.start;
          return item.departureMinutes >= window.start && item.departureMinutes < window.end;
        });
        if (!inAnyWindow) return false;
      }

      const [minPrice, maxPrice] = filters.priceRange;
      if (Number.isFinite(item.startingPrice)) {
        if (item.startingPrice < minPrice || item.startingPrice > maxPrice) return false;
      }

      return true;
    });
  }, [filters, mappedResults]);

  const sortedResults = useMemo(() => {
    const list = [...filteredResults];

    if (sortBy === "price-asc") {
      return list.sort((a, b) => a.startingPrice - b.startingPrice);
    }

    if (sortBy === "price-desc") {
      return list.sort((a, b) => b.startingPrice - a.startingPrice);
    }

    if (sortBy === "departure-early") {
      return list.sort((a, b) => {
        const left = Number.isFinite(a.departureMinutes) ? a.departureMinutes : Number.MAX_SAFE_INTEGER;
        const right = Number.isFinite(b.departureMinutes) ? b.departureMinutes : Number.MAX_SAFE_INTEGER;
        return left - right;
      });
    }

    if (sortBy === "departure-late") {
      return list.sort((a, b) => {
        const left = Number.isFinite(a.departureMinutes) ? a.departureMinutes : -1;
        const right = Number.isFinite(b.departureMinutes) ? b.departureMinutes : -1;
        return right - left;
      });
    }

    if (sortBy === "duration-short") {
      return list.sort((a, b) => {
        const left = Number.isFinite(a.durationMinutes) ? a.durationMinutes : Number.MAX_SAFE_INTEGER;
        const right = Number.isFinite(b.durationMinutes) ? b.durationMinutes : Number.MAX_SAFE_INTEGER;
        return left - right;
      });
    }

    return list.sort((a, b) => {
      if (a.refundable !== b.refundable) return a.refundable ? -1 : 1;
      if (a.shift !== b.shift) return a.shift === "night" ? -1 : 1;
      return a.startingPrice - b.startingPrice;
    });
  }, [filteredResults, sortBy]);

  const activeFilterTags = useMemo(() => {
    const tags = [];

    const pushTags = (groupKey, values) => {
      values.forEach((value) => {
        tags.push({ key: `${groupKey}:${value}`, groupKey, value, label: value });
      });
    };

    pushTags("busTypes", filters.busTypes.map((value) => STATIC_FILTER_OPTIONS.busTypes.find((item) => item.value === value)?.label || value));
    pushTags("shifts", filters.shifts.map((value) => STATIC_FILTER_OPTIONS.shifts.find((item) => item.value === value)?.label || value));
    pushTags("operators", filters.operators);
    pushTags("vehicleTypes", filters.vehicleTypes.map((value) => STATIC_FILTER_OPTIONS.vehicleTypes.find((item) => item.value === value)?.label || value));
    pushTags("seatTypes", filters.seatTypes.map((value) => STATIC_FILTER_OPTIONS.seatTypes.find((item) => item.value === value)?.label || value));
    pushTags("facilities", filters.facilities.map((value) => STATIC_FILTER_OPTIONS.facilities.find((item) => item.value === value)?.label || value));
    pushTags("boardingPoints", filters.boardingPoints);
    pushTags("droppingPoints", filters.droppingPoints);

    if (filters.refundableOnly) {
      tags.push({ key: "refundableOnly:true", groupKey: "refundableOnly", value: true, label: "Refundable" });
    }

    return tags;
  }, [filters]);

  const toggleMultiFilter = (groupKey, value) => {
    setFilters((prev) => {
      const current = Array.isArray(prev[groupKey]) ? prev[groupKey] : [];
      const exists = current.includes(value);
      const next = exists ? current.filter((item) => item !== value) : [...current, value];
      return { ...prev, [groupKey]: next };
    });
  };

  const toggleDepartureWindow = (token) => {
    toggleMultiFilter("departureWindows", token);
  };

  const setPriceRange = (nextRange) => {
    if (!Array.isArray(nextRange) || nextRange.length < 2) return;
    setFilters((prev) => ({ ...prev, priceRange: nextRange }));
  };

  const toggleRefundableOnly = () => {
    setFilters((prev) => ({ ...prev, refundableOnly: !prev.refundableOnly }));
  };

  const clearAllFilters = () => {
    setFilters({
      ...INITIAL_FILTERS,
      priceRange: [dynamicFilterOptions.priceBounds.min, dynamicFilterOptions.priceBounds.max],
    });
  };

  const removeTag = (tag) => {
    if (tag.groupKey === "refundableOnly") {
      setFilters((prev) => ({ ...prev, refundableOnly: false }));
      return;
    }

    const optionMap = {
      busTypes: STATIC_FILTER_OPTIONS.busTypes,
      shifts: STATIC_FILTER_OPTIONS.shifts,
      vehicleTypes: STATIC_FILTER_OPTIONS.vehicleTypes,
      seatTypes: STATIC_FILTER_OPTIONS.seatTypes,
      facilities: STATIC_FILTER_OPTIONS.facilities,
    };

    const groupOptions = optionMap[tag.groupKey];
    if (groupOptions) {
      const original = groupOptions.find((item) => item.label === tag.value || item.value === tag.value);
      if (original) {
        toggleMultiFilter(tag.groupKey, original.value);
        return;
      }
    }

    setFilters((prev) => ({
      ...prev,
      [tag.groupKey]: Array.isArray(prev[tag.groupKey])
        ? prev[tag.groupKey].filter((item) => item !== tag.value)
        : prev[tag.groupKey],
    }));
  };

  const onSubmitSearch = async (event) => {
    event.preventDefault();
    await runSearch({ sourceValue: source, destinationValue: destination, dateValue: date, syncQuery: true });
  };

  const summarySource = source || "Any Source";
  const summaryDestination = destination || "Any Destination";
  const summaryDate = date ? formatDateLabel(date) : "Any Date";

  return (
    <div className="relative min-h-screen overflow-hidden bg-white text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(124,58,237,0.08),transparent_36%),radial-gradient(circle_at_80%_0%,rgba(139,92,246,0.1),transparent_36%)]" />
      <div className="pointer-events-none absolute -left-12 -top-20 h-64 w-64 rounded-full bg-violet-200/45 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-14 right-0 h-72 w-72 rounded-full bg-purple-200/45 blur-3xl" />

      <div className="relative mx-auto max-w-7xl px-4 pb-10 pt-6 sm:px-6 lg:px-8">
        <form onSubmit={onSubmitSearch} autoComplete="off" className="mb-5 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_1fr_180px_auto] md:items-end">
            <LocationAutocompleteInput
              id="search-source"
              labelContent={(
                <>
                  <RouteIcon className="h-3.5 w-3.5 text-violet-600" />
                  Source
                </>
              )}
              value={source}
              onValueChange={setSource}
              placeholder="Kathmandu"
              debounceMs={300}
              limit={10}
              inputClassName="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
              highlightClassName="font-semibold text-violet-700"
            />

            <LocationAutocompleteInput
              id="search-destination"
              labelContent={(
                <>
                  <RouteIcon className="h-3.5 w-3.5 text-violet-600" />
                  Destination
                </>
              )}
              value={destination}
              onValueChange={setDestination}
              placeholder="Kakarbhitta"
              debounceMs={300}
              limit={10}
              inputClassName="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
              highlightClassName="font-semibold text-violet-700"
            />

            <label className="block">
              <span className="mb-1.5 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                Date
              </span>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-violet-300 focus:bg-white focus:ring-4 focus:ring-violet-100"
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-linear-to-r from-violet-600 to-purple-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_26px_rgba(109,40,217,0.32)] transition hover:from-violet-700 hover:to-purple-800 disabled:opacity-70"
            >
              <Search className="h-4 w-4" />
              {loading ? "Searching..." : "Search Buses"}
            </button>
          </div>
          {error ? <p className="mt-3 text-sm text-rose-600">{error}</p> : null}
        </form>

        <SearchHeader
          tripCount={sortedResults.length}
          sourceLabel={summarySource}
          destinationLabel={summaryDestination}
          dateLabel={summaryDate}
          sortBy={sortBy}
          sortOptions={SORT_OPTIONS}
          onSortChange={setSortBy}
          onOpenFilters={() => setMobileFiltersOpen(true)}
        />

        <FilterTagList tags={activeFilterTags} onRemove={removeTag} onClearAll={clearAllFilters} />

        <div className="mt-5 grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
          <aside className="hidden lg:sticky lg:top-4 lg:block">
            <FilterSidebar
              filters={filters}
              options={dynamicFilterOptions}
              onToggleMulti={toggleMultiFilter}
              onToggleDepartureWindow={toggleDepartureWindow}
              onPriceChange={setPriceRange}
              onToggleRefundable={toggleRefundableOnly}
              onClearAll={clearAllFilters}
            />
          </aside>

          <section className="space-y-4">
            {loading ? (
              <div className="grid gap-4">
                <div className="skeleton h-72" />
                <div className="skeleton h-72" />
                <div className="skeleton h-72" />
              </div>
            ) : null}

            {!loading && sortedResults.length === 0 && hasSearched ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
                <BusFront className="mx-auto mb-3 h-8 w-8 text-violet-600" />
                <h3 className="text-lg font-semibold text-slate-900">No buses match your filters</h3>
                <p className="mt-1 text-sm text-slate-600">Try clearing some filters or changing date and route.</p>
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="mt-4 rounded-lg bg-violet-100 px-3 py-2 text-xs font-semibold text-violet-700 hover:bg-violet-200"
                >
                  Reset filters
                </button>
              </div>
            ) : null}

            {!loading && sortedResults.map((item) => <BusResultCard key={item.id} item={item} />)}
          </section>
        </div>
      </div>

      <AnimatePresence>
        {mobileFiltersOpen ? (
          <motion.div
            className="fixed inset-0 z-50 bg-slate-950/40 p-3 backdrop-blur-sm lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="mx-auto flex h-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white"
            >
              <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                  <Filter className="h-4 w-4" />
                  Filters
                </p>
                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(false)}
                  className="rounded-lg border border-slate-200 p-1.5 text-slate-600 hover:text-violet-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex-1 overflow-auto p-3">
                <FilterSidebar
                  filters={filters}
                  options={dynamicFilterOptions}
                  onToggleMulti={toggleMultiFilter}
                  onToggleDepartureWindow={toggleDepartureWindow}
                  onPriceChange={setPriceRange}
                  onToggleRefundable={toggleRefundableOnly}
                  onClearAll={clearAllFilters}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-slate-200 p-3">
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700"
                >
                  Clear
                </button>
                <button
                  type="button"
                  onClick={() => setMobileFiltersOpen(false)}
                  className="rounded-lg bg-linear-to-r from-violet-600 to-purple-700 px-3 py-2 text-sm font-semibold text-white"
                >
                  Show {sortedResults.length} buses
                </button>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
