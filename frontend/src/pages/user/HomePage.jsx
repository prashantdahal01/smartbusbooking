import { ArrowRight, BusFront, Clock3, ShieldCheck, Ticket, MapPin, ArrowUpRight } from "lucide-react";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getPopularRoutes, searchSchedules } from "../../services/booking.service";
import { getBusTypeLabels } from "../../utils/busTypeUtils";
import { formatCurrency, getBusImageUrl } from "../../utils/helpers";
import DatePicker from "../../components/search/DatePicker";
import LocationAutocompleteInput from "../../components/search/LocationAutocompleteInput";
import SwapButton from "../../components/search/SwapButton";

const HimalayaHeroScene = lazy(() => import("../../components/hero/HimalayaHeroScene"));

const ROUTE_CARD_TONES = [
  "from-amber-500 to-orange-600",
  "from-emerald-500 to-teal-700",
  "from-sky-500 to-blue-700",
  "from-rose-500 to-pink-700",
];

const TRUST_POINTS = [
  {
    icon: ShieldCheck,
    title: "Secure Booking",
    text: "Trusted payments and passenger information protection for every trip.",
    accent: "text-amber-400",
    bg: "bg-amber-400/10 border-amber-400/20",
  },
  {
    icon: Ticket,
    title: "Instant Ticket",
    text: "Receive booking confirmation quickly after successful payment.",
    accent: "text-emerald-400",
    bg: "bg-emerald-400/10 border-emerald-400/20",
  },
  {
    icon: BusFront,
    title: "Real-Time Seats",
    text: "Check seat availability live before confirming your booking.",
    accent: "text-sky-400",
    bg: "bg-sky-400/10 border-sky-400/20",
  },
];

const normalizeDateKey = (value) => {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  return raw;
};

const toTitleLabel = (value) => String(value || "")
  .trim()
  .replace(/[\s_-]+/g, " ")
  .split(" ")
  .filter(Boolean)
  .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
  .join(" ");

const parseTimeToMinutes = (value) => {
  const match = String(value || "").trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return (hour * 60) + minute;
};

const formatMinutesAsTime = (minutes) => {
  const dayMinutes = 24 * 60;
  const safe = ((Math.round(minutes) % dayMinutes) + dayMinutes) % dayMinutes;
  const hour24 = Math.floor(safe / 60);
  const minute = safe % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
};

const formatTimeLabel = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "--";
  if (/(am|pm)$/i.test(raw)) return raw.replace(/\s+/g, " ").toUpperCase();
  const minutes = parseTimeToMinutes(raw);
  if (minutes === null) return raw;
  return formatMinutesAsTime(minutes);
};

const formatDateLabel = (dateKey) => {
  const safeKey = normalizeDateKey(dateKey);
  if (!safeKey) return "Date TBD";
  const date = new Date(`${safeKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return safeKey;
  return date.toLocaleDateString(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const getArrivalTimeLabel = (schedule) => {
  if (schedule?.arrivalTime) return formatTimeLabel(schedule.arrivalTime);
  const departureMinutes = parseTimeToMinutes(schedule?.time);
  const durationMinutes = Number(schedule?.durationMinutes);
  if (departureMinutes === null || !Number.isFinite(durationMinutes) || durationMinutes <= 0) return "--";
  return formatMinutesAsTime(departureMinutes + durationMinutes);
};

const getStartingPrice = (schedule) => {
  const directPrice = Number(schedule?.price);
  if (Number.isFinite(directPrice) && directPrice > 0) return directPrice;
  const deckPrices = (Array.isArray(schedule?.bus?.decks) ? schedule.bus.decks : [])
    .flatMap((deck) => (Array.isArray(deck?.seats) ? deck.seats : []))
    .map((seat) => Number(seat?.price))
    .filter((price) => Number.isFinite(price) && price > 0);
  if (deckPrices.length > 0) return Math.min(...deckPrices);
  return null;
};

export default function HomePage() {
  const navigate = useNavigate();
  const [source, setSource] = useState("");
  const [destination, setDestination] = useState("");
  const [date, setDate] = useState("");
  const [isSearchHovered, setIsSearchHovered] = useState(false);
  const [sourceLocation, setSourceLocation] = useState(null);
  const [destinationLocation, setDestinationLocation] = useState(null);
  const [touched, setTouched] = useState({ source: false, destination: false, date: false });

  const [popularRoutes, setPopularRoutes] = useState([]);
  const [popularLoading, setPopularLoading] = useState(true);
  const [popularError, setPopularError] = useState("");

  const [featuredSchedules, setFeaturedSchedules] = useState([]);
  const [featuredLoading, setFeaturedLoading] = useState(true);
  const [featuredError, setFeaturedError] = useState("");

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const todayDate = `${yyyy}-${mm}-${dd}`;

  const inputClassName =
    "w-full rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-amber-500 focus:bg-slate-800 focus:ring-2 focus:ring-amber-500/20";
  const labelClassName =
    "mb-1.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400";

  const normalized = (value) => String(value || "").trim().toLowerCase();
  const buildRouteKey = (sourceValue, destinationValue) =>
    `${normalized(sourceValue)}__${normalized(destinationValue)}`;

  const routePreviewImageByKey = useMemo(() => {
    const map = new Map();
    (Array.isArray(featuredSchedules) ? featuredSchedules : []).forEach((schedule) => {
      const key = buildRouteKey(schedule?.route?.source, schedule?.route?.destination);
      if (!key || map.has(key)) return;
      const image = getBusImageUrl(schedule?.bus, "bus");
      if (!image) return;
      map.set(key, image);
    });
    return map;
  }, [featuredSchedules]);

  useEffect(() => {
    void (async () => {
      setPopularLoading(true);
      setPopularError("");
      try {
        const data = await getPopularRoutes(4);
        setPopularRoutes(Array.isArray(data) ? data : []);
      } catch (error) {
        setPopularRoutes([]);
        setPopularError(error?.response?.data?.message || error?.message || "Unable to load popular routes");
      } finally {
        setPopularLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      setFeaturedLoading(true);
      setFeaturedError("");
      try {
        const data = await searchSchedules({});
        const allSchedules = Array.isArray(data) ? data : [];
        const upcomingSchedules = allSchedules
          .filter((schedule) => {
            const scheduleDate = normalizeDateKey(schedule?.date);
            if (!scheduleDate) return false;
            return scheduleDate >= todayDate;
          })
          .sort((a, b) => {
            const dateA = normalizeDateKey(a?.date);
            const dateB = normalizeDateKey(b?.date);
            if (dateA !== dateB) return dateA.localeCompare(dateB);
            const timeA = parseTimeToMinutes(a?.time);
            const timeB = parseTimeToMinutes(b?.time);
            const safeA = Number.isFinite(timeA) ? timeA : Number.MAX_SAFE_INTEGER;
            const safeB = Number.isFinite(timeB) ? timeB : Number.MAX_SAFE_INTEGER;
            return safeA - safeB;
          });
        setFeaturedSchedules(upcomingSchedules);
      } catch (error) {
        setFeaturedSchedules([]);
        setFeaturedError(error?.response?.data?.message || error?.message || "Unable to load featured buses");
      } finally {
        setFeaturedLoading(false);
      }
    })();
  }, [todayDate]);

  const onSearch = (event) => {
    event.preventDefault();
    setTouched({ source: true, destination: true, date: true });
    const sourceText = source.trim();
    const destinationText = destination.trim();
    if (!sourceText || !destinationText || !date) return;
    const params = new URLSearchParams();
    params.set("from", sourceText);
    params.set("to", destinationText);
    params.set("date", date);
    navigate(`/search?${params.toString()}`);
  };

  const openPopularRoute = (route) => {
    const params = new URLSearchParams();
    params.set("from", route.source);
    params.set("to", route.destination);
    if (date) params.set("date", date);
    navigate(`/search?${params.toString()}`);
  };

  const sourceError = touched.source && !source.trim() ? "Please choose a departure city." : "";
  const destinationError = touched.destination && !destination.trim() ? "Please choose a destination city." : "";
  const dateError = touched.date && !date ? "Please select a travel date." : "";

  const onSwap = () => {
    setSource(() => destination);
    setDestination(source);
    setSourceLocation(destinationLocation);
    setDestinationLocation(sourceLocation);
  };

  const onSourceChange = (value) => {
    setSource(value);
    const norm = String(value || "").trim();
    if (sourceLocation?.name && sourceLocation.name !== norm) setSourceLocation(null);
  };

  const onDestinationChange = (value) => {
    setDestination(value);
    const norm = String(value || "").trim();
    if (destinationLocation?.name && destinationLocation.name !== norm) setDestinationLocation(null);
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-slate-950 text-slate-100" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* Ambient background glows */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div className="absolute -top-64 left-1/4 h-[500px] w-[500px] rounded-full bg-amber-600/8 blur-[140px]" />
        <div className="absolute top-1/3 -right-40 h-[400px] w-[400px] rounded-full bg-emerald-600/6 blur-[120px]" />
        <div className="absolute bottom-0 left-0 h-[300px] w-[600px] rounded-full bg-slate-700/20 blur-[100px]" />
      </div>

      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-4 pb-20 sm:px-6 lg:px-8">

        {/* ───────────── HERO ───────────── */}
        <section className="relative mx-auto mt-6 flex min-h-[calc(100vh-100px)] w-full max-w-6xl flex-col items-center justify-center overflow-hidden rounded-3xl border border-slate-800 shadow-2xl">

          {/* Hero background */}
          <Suspense fallback={<div className="absolute inset-0 bg-slate-900" />}>
            <HimalayaHeroScene searchHovered={isSearchHovered} />
          </Suspense>
          <div className="absolute inset-0 bg-gradient-to-b from-slate-950/60 via-slate-950/30 to-slate-950/80" />

          {/* Decorative grid overlay */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
              backgroundSize: "60px 60px",
            }}
          />

          <div className="relative z-10 w-full px-4 py-16 text-center sm:px-8">

            {/* Eyebrow badge */}
            <div className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-5 py-2 text-xs font-bold uppercase tracking-[0.25em] text-amber-400 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" style={{ animation: "pulse 2s infinite" }} />
              SmartBus Nepal
            </div>

            {/* Hero headline */}
            <h1
              className="text-6xl font-black leading-[0.95] tracking-tight text-white sm:text-7xl lg:text-8xl"
              style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}
            >
              Your Journey,{" "}
              <span className="relative inline-block">
                <span className="relative z-10 text-amber-400">Simplified.</span>
                <span className="absolute -bottom-1 left-0 right-0 h-3 bg-amber-400/15 blur-sm" />
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-slate-300 sm:text-xl">
              Book bus tickets across Nepal — fast, reliable, with real-time seat availability.
            </p>

            {/* ── Search card ── */}
            <div className="mx-auto mt-12 w-full max-w-4xl">
              <form
                onSubmit={onSearch}
                autoComplete="off"
                className="overflow-hidden rounded-2xl border border-slate-700/60 bg-slate-900/90 shadow-[0_32px_64px_rgba(0,0,0,0.6)] backdrop-blur-xl"
              >
                {/* Form header bar */}
                <div className="border-b border-slate-800 bg-slate-800/60 px-6 py-3.5 text-left">
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Search Your Route</span>
                </div>

                <div className="p-5 sm:p-6">
                  <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_200px_auto] md:items-end">

                    {/* From */}
                    <div>
                      <span className={labelClassName}>
                        <MapPin className="h-3 w-3" /> From
                      </span>
                      <LocationAutocompleteInput
                        id="home-from"
                        value={source}
                        onValueChange={onSourceChange}
                        onSelect={(item) => setSourceLocation(item)}
                        placeholder="Departure city"
                        debounceMs={250}
                        limit={10}
                        wrapperClassName="block"
                        labelContent={null}
                        inputClassName={inputClassName}
                        highlightClassName="font-bold text-amber-400"
                        noResultsText="No results found"
                      />
                      {sourceError && <p className="mt-1 text-xs text-rose-400">{sourceError}</p>}
                    </div>

                    {/* Swap */}
                    <div className="flex items-end justify-center md:pb-0.5">
                      <SwapButton onClick={onSwap} />
                    </div>

                    {/* To */}
                    <div>
                      <span className={labelClassName}>
                        <MapPin className="h-3 w-3" /> To
                      </span>
                      <LocationAutocompleteInput
                        id="home-to"
                        value={destination}
                        onValueChange={onDestinationChange}
                        onSelect={(item) => setDestinationLocation(item)}
                        placeholder="Destination city"
                        debounceMs={250}
                        limit={10}
                        wrapperClassName="block"
                        labelContent={null}
                        inputClassName={inputClassName}
                        highlightClassName="font-bold text-amber-400"
                        noResultsText="No results found"
                      />
                      {destinationError && <p className="mt-1 text-xs text-rose-400">{destinationError}</p>}
                    </div>

                    {/* Date */}
                    <div>
                      <span className={labelClassName}>Date</span>
                      <DatePicker
                        value={date}
                        onChange={(next) => {
                          setDate(next);
                          setTouched((prev) => ({ ...prev, date: true }));
                        }}
                        minDate={todayDate}
                      />
                      {dateError && <p className="mt-1 text-xs text-rose-400">{dateError}</p>}
                    </div>

                    {/* Search button */}
                    <button
                      type="submit"
                      onMouseEnter={() => setIsSearchHovered(true)}
                      onMouseLeave={() => setIsSearchHovered(false)}
                      onFocus={() => setIsSearchHovered(true)}
                      onBlur={() => setIsSearchHovered(false)}
                      className="group inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-amber-500 px-5 text-sm font-bold text-slate-950 shadow-lg shadow-amber-500/25 transition-all duration-200 hover:bg-amber-400 hover:shadow-amber-400/30 active:scale-95"
                    >
                      Search
                      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </button>
                  </div>
                </div>
              </form>
            </div>

            {/* Stats row */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-8">
              {[
                { label: "Routes covered", value: "50+" },
                { label: "Daily departures", value: "200+" },
                { label: "Happy passengers", value: "10k+" },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="text-2xl font-black text-white">{stat.value}</div>
                  <div className="mt-0.5 text-xs font-medium text-slate-400 uppercase tracking-wider">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ───────────── TRUST CARDS ───────────── */}
        <section className="mt-10 grid gap-4 sm:grid-cols-3">
          {TRUST_POINTS.map((point) => {
            const Icon = point.icon;
            return (
              <article
                key={point.title}
                className={`group rounded-2xl border bg-slate-900/70 p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg ${point.bg}`}
              >
                <div className={`inline-flex rounded-xl border p-2.5 ${point.bg} ${point.accent}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-bold text-slate-100">{point.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{point.text}</p>
              </article>
            );
          })}
        </section>

        {/* ───────────── POPULAR ROUTES ───────────── */}
        <section className="mt-24">

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="h-px w-8 bg-amber-500" />
                <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-400">Popular Routes</span>
              </div>
              <h2
                className="mt-2 text-4xl font-black text-white sm:text-5xl"
                style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}
              >
                Most Booked
              </h2>
            </div>
          </div>

          {popularLoading && (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-64 animate-pulse rounded-2xl bg-slate-800" />
              ))}
            </div>
          )}

          {!popularLoading && popularError && (
            <div className="mt-6 rounded-xl border border-rose-800/50 bg-rose-900/30 px-5 py-4 text-sm text-rose-400">
              {popularError}
            </div>
          )}

          {!popularLoading && !popularError && (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {popularRoutes.length > 0 ? (
                popularRoutes.map((route, index) => {
                  const tone = ROUTE_CARD_TONES[index % ROUTE_CARD_TONES.length];
                  const fareText = route?.minSeatPrice ? formatCurrency(route.minSeatPrice) : "—";
                  const imageKey = buildRouteKey(route?.source, route?.destination);
                  const previewImage = routePreviewImageByKey.get(imageKey);

                  return (
                    <article
                      key={route.routeId || `${route.source}-${route.destination}`}
                      className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 transition-all duration-300 hover:-translate-y-1 hover:border-slate-700 hover:shadow-2xl hover:shadow-black/40"
                    >
                      {/* Image / gradient */}
                      <div className="relative h-36 overflow-hidden">
                        {previewImage ? (
                          <img
                            src={previewImage}
                            alt={`${route.source} to ${route.destination}`}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover brightness-75 transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className={`h-full w-full bg-gradient-to-br ${tone} opacity-80 transition-transform duration-500 group-hover:scale-105`} />
                        )}
                        {/* Fare pill */}
                        <div className="absolute left-3 top-3 rounded-lg bg-slate-950/80 px-2.5 py-1 text-xs font-bold text-amber-400 backdrop-blur-sm">
                          from {fareText}
                        </div>
                      </div>

                      <div className="p-4">
                        <div className="flex items-center gap-1.5 text-sm font-bold text-slate-100">
                          <span>{route.source}</span>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                          <span>{route.destination}</span>
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {route?.bookingCount > 0
                            ? `${route.bookingCount}+ bookings`
                            : `${route?.scheduleCount || 0} schedules`}
                        </p>
                        <button
                          type="button"
                          onClick={() => openPopularRoute(route)}
                          className="group/btn mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 py-2 text-xs font-bold text-slate-200 transition-all duration-200 hover:border-amber-500/40 hover:bg-amber-500/10 hover:text-amber-400"
                        >
                          Search Route
                          <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5" />
                        </button>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-6 py-5 text-sm text-slate-500 sm:col-span-2 lg:col-span-4">
                  No routes available yet. Add routes from the admin panel.
                </div>
              )}
            </div>
          )}
        </section>

        {/* ───────────── AVAILABLE BUSES ───────────── */}
        <section className="mt-24">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="h-px w-8 bg-emerald-500" />
                <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-emerald-400">Available Buses</span>
              </div>
              <h2
                className="mt-2 text-4xl font-black text-white sm:text-5xl"
                style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}
              >
                Choose Your Ride
              </h2>
            </div>
            <Link
              to="/search"
              className="group inline-flex items-center gap-1.5 text-sm font-bold text-slate-400 transition hover:text-amber-400"
            >
              View all schedules
              <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>

          {featuredLoading && (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-96 animate-pulse rounded-2xl bg-slate-800" />
              ))}
            </div>
          )}

          {!featuredLoading && featuredError && (
            <div className="mt-6 rounded-xl border border-rose-800/50 bg-rose-900/30 px-5 py-4 text-sm text-rose-400">
              {featuredError}
            </div>
          )}

          {!featuredLoading && !featuredError && (
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featuredSchedules.length > 0 ? (
                featuredSchedules.map((schedule) => {
                  const busImage = getBusImageUrl(schedule?.bus, "bus");
                  const title = String(schedule?.bus?.name || "Bus Service").trim();
                  const sourceLabel = String(schedule?.route?.source || "").trim();
                  const destinationLabel = String(schedule?.route?.destination || "").trim();
                  const travelDateLabel = formatDateLabel(schedule?.date);
                  const departureTimeLabel = formatTimeLabel(schedule?.time);
                  const arrivalTimeLabel = getArrivalTimeLabel(schedule);
                  const badgeLabel = getBusTypeLabels(schedule?.bus)[0] || toTitleLabel(schedule?.bus?.type) || "Bus";
                  const startingPrice = getStartingPrice(schedule);

                  return (
                    <article
                      key={schedule._id}
                      className="group overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 transition-all duration-300 hover:-translate-y-1 hover:border-slate-700 hover:shadow-2xl hover:shadow-black/40"
                    >
                      {/* Bus image */}
                      <div className="relative h-44 overflow-hidden bg-slate-800">
                        {busImage ? (
                          <img
                            src={busImage}
                            alt={title}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover brightness-75 transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-800 to-slate-700">
                            <BusFront className="h-12 w-12 text-slate-600" />
                          </div>
                        )}
                        {/* Date chip */}
                        <div className="absolute left-3 top-3 rounded-lg bg-slate-950/80 px-2.5 py-1 text-xs font-semibold text-slate-300 backdrop-blur-sm">
                          {travelDateLabel}
                        </div>
                        {/* Type badge */}
                        <div className="absolute right-3 top-3 rounded-lg bg-amber-500/90 px-2.5 py-1 text-xs font-bold text-slate-950 backdrop-blur-sm">
                          {badgeLabel}
                        </div>
                      </div>

                      <div className="p-5">
                        {/* Title & route */}
                        <div>
                          <h3 className="text-lg font-bold text-slate-100">{title}</h3>
                          <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-400">
                            <span>{sourceLabel}</span>
                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                            <span>{destinationLabel}</span>
                          </div>
                        </div>

                        {/* Time row */}
                        <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-800/60 px-4 py-3">
                          <Clock3 className="h-4 w-4 shrink-0 text-slate-500" />
                          <span className="text-sm font-semibold text-slate-200">{departureTimeLabel}</span>
                          <div className="mx-1 h-px flex-1 border-t border-dashed border-slate-700" />
                          <span className="text-sm font-semibold text-slate-200">{arrivalTimeLabel}</span>
                        </div>

                        {/* Price + CTA */}
                        <div className="mt-4 flex items-end justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Starting from</p>
                            <div className="mt-0.5 text-2xl font-black text-amber-400">
                              {startingPrice ? formatCurrency(startingPrice) : <span className="text-base font-semibold text-slate-400">See seat map</span>}
                            </div>
                          </div>
                          <Link
                            to={`/seats/${schedule._id}`}
                            className="group/btn inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 shadow-md shadow-amber-500/20 transition-all duration-200 hover:bg-amber-400 hover:shadow-amber-400/30 active:scale-95"
                          >
                            View Seats
                            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover/btn:translate-x-0.5" />
                          </Link>
                        </div>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-slate-800 bg-slate-900/70 px-6 py-5 text-sm text-slate-500 sm:col-span-2 lg:col-span-3">
                  No schedules found for today. Try searching by route and date.
                </div>
              )}
            </div>
          )}
        </section>

        {/* ───────────── CTA BANNER ───────────── */}
        <section className="relative mt-24 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">

          {/* Decorative amber glow */}
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-amber-500/15 blur-[80px]" />
          <div className="absolute -bottom-10 left-10 h-48 w-48 rounded-full bg-emerald-500/10 blur-[60px]" />

          {/* Dot grid */}
          <div
            className="absolute inset-0 opacity-[0.05]"
            style={{
              backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.8) 1px, transparent 1px)",
              backgroundSize: "28px 28px",
            }}
          />

          <div className="relative z-10 flex flex-col items-center px-8 py-16 text-center sm:px-14 sm:py-20">
            <div className="flex items-center gap-2.5">
              <div className="h-px w-8 bg-amber-500" />
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-400">Ready to travel?</span>
              <div className="h-px w-8 bg-amber-500" />
            </div>

            <h2
              className="mt-5 text-4xl font-black text-white sm:text-5xl"
              style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}
            >
              Find & Book Your Bus{" "}
              <span className="text-amber-400">in Minutes</span>
            </h2>

            <p className="mx-auto mt-4 max-w-lg text-base leading-relaxed text-slate-400 sm:text-lg">
              Compare schedules, pick your seat, and confirm your trip — all from any device.
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Link
                to="/search"
                className="group inline-flex items-center gap-2.5 rounded-xl bg-amber-500 px-7 py-3.5 text-base font-bold text-slate-950 shadow-lg shadow-amber-500/25 transition-all duration-200 hover:bg-amber-400 active:scale-95"
              >
                Search Buses
                <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center rounded-xl border border-slate-700 px-7 py-3.5 text-base font-bold text-slate-300 transition-all duration-200 hover:border-slate-600 hover:bg-slate-800 hover:text-white active:scale-95"
              >
                Login to Continue
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* ───────────── FOOTER ───────────── */}
      <footer className="relative z-10 mt-20 border-t border-slate-800 bg-slate-950 py-8 text-center">
        <p className="text-sm font-semibold text-slate-400">
          Developed by <span className="font-bold text-white">Prashant Dahal</span>
        </p>
        <p className="mt-1.5 text-xs text-slate-600">
          © {new Date().getFullYear()} SmartBus Booking. All rights reserved.
        </p>
      </footer>
    </div>
  );
}