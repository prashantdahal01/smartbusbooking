import { ArrowRight, BusFront, CalendarDays, Clock3, ShieldCheck, Ticket } from "lucide-react";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { getPopularRoutes, searchSchedules } from "../../services/booking.service";
import { getBusTypeLabels } from "../../utils/busTypeUtils";
import { formatCurrency, getBusImageUrl } from "../../utils/helpers";

const HimalayaHeroScene = lazy(() => import("../../components/hero/HimalayaHeroScene"));

const ROUTE_CARD_TONES = [
  "from-violet-500 to-purple-700",
  "from-fuchsia-500 to-violet-700",
  "from-indigo-500 to-violet-700",
  "from-purple-500 to-indigo-700",
];

const TRUST_POINTS = [
  {
    icon: ShieldCheck,
    title: "Secure Booking",
    text: "Trusted payments and passenger information protection for every trip.",
  },
  {
    icon: Ticket,
    title: "Instant Ticket",
    text: "Receive booking confirmation quickly after successful payment.",
  },
  {
    icon: BusFront,
    title: "Real-Time Seats",
    text: "Check seat availability live before confirming your booking.",
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
  if (departureMinutes === null || !Number.isFinite(durationMinutes) || durationMinutes <= 0) {
    return "--";
  }
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

  const searchInputClassName = "mt-2 w-full rounded-xl border border-violet-200 bg-white/90 px-4 py-3.5 text-sm text-slate-900 outline-none backdrop-blur-sm transition-all duration-300 focus:border-violet-500 focus:ring-2 focus:ring-violet-300/50 focus:bg-white";

  const normalized = (value) => String(value || "").trim().toLowerCase();
  const buildRouteKey = (sourceValue, destinationValue) => `${normalized(sourceValue)}__${normalized(destinationValue)}`;

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
    // eslint-disable-next-line no-void
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
    // eslint-disable-next-line no-void
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
    const params = new URLSearchParams();
    if (source.trim()) params.set("source", source.trim());
    if (destination.trim()) params.set("destination", destination.trim());
    if (date) params.set("date", date);
    navigate(`/search?${params.toString()}`);
  };

  const openPopularRoute = (route) => {
    const params = new URLSearchParams();
    params.set("source", route.source);
    params.set("destination", route.destination);
    if (date) params.set("date", date);
    navigate(`/search?${params.toString()}`);
  };

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-linear-to-br from-violet-100 via-purple-50 to-indigo-100 text-slate-900">
      {/* Enhanced background blur circles */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 h-125 w-125 rounded-full bg-violet-300/20 blur-[120px]" />
        <div className="absolute -right-32 top-1/3 h-125 w-125 rounded-full bg-fuchsia-300/20 blur-[120px]" />
        <div className="absolute -bottom-40 left-1/4 h-125 w-125 rounded-full bg-indigo-300/20 blur-[120px]" />
        <div className="absolute left-1/2 top-1/2 h-100 w-100 -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-300/15 blur-[100px]" />
      </div>

      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-4 pb-16 sm:px-6 lg:px-8">
        {/* Enhanced Hero Section */}
        <section className="relative mx-auto flex min-h-[calc(100vh-88px)] w-full max-w-6xl items-center justify-center overflow-hidden rounded-4xl border border-violet-300/45 py-10 shadow-[0_28px_70px_-26px_rgba(30,41,59,0.45)] sm:py-12">
          <Suspense fallback={<div className="absolute inset-0 z-0 bg-linear-to-br from-sky-300 via-sky-200 to-violet-100" />}>
            <HimalayaHeroScene searchHovered={isSearchHovered} />
          </Suspense>
          <div className="absolute inset-0 z-0 bg-linear-to-b from-white/22 via-white/12 to-violet-950/20" />

          <div className="relative z-10 w-full px-4 pt-8 text-center sm:px-8 sm:pt-14">

            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-300/50 bg-white/60 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.2em] text-violet-700 shadow-sm backdrop-blur-sm">
              <span className="h-2 w-2 rounded-full bg-violet-600 animate-pulse" />
              SmartBus Booking
            </div>

            <h1 className="text-5xl font-extrabold leading-tight text-violet-950 sm:text-6xl lg:text-7xl">
              Plan Your Trip
            </h1>
            
            <p className="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-violet-800/80 sm:text-xl">
              Book Bus Tickets Easily Across Nepal
            </p>

            {/* Enhanced Search Card with Glassmorphism */}
            <div className="mx-auto mt-10 w-full max-w-4xl">
              <form
                onSubmit={onSearch}
                autoComplete="off"
                className="group rounded-3xl border border-white/30 bg-white/80 p-8 shadow-[0_25px_50px_-12px_rgba(76,29,149,0.25)] backdrop-blur-md transition-all duration-500 hover:scale-[1.02] hover:shadow-[0_30px_60px_-15px_rgba(76,29,149,0.35)] sm:p-10"
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="text-left">
                    <span className="text-xs font-bold uppercase tracking-wider text-violet-700">From</span>
                    <input
                      type="text"
                      value={source}
                      onChange={(event) => setSource(event.target.value)}
                      placeholder="Pickup location"
                      required
                      className={searchInputClassName}
                    />
                  </label>

                  <label className="text-left">
                    <span className="text-xs font-bold uppercase tracking-wider text-violet-700">To</span>
                    <input
                      type="text"
                      value={destination}
                      onChange={(event) => setDestination(event.target.value)}
                      placeholder="Destination"
                      required
                      className={searchInputClassName}
                    />
                  </label>

                  <label className="text-left">
                    <span className="text-xs font-bold uppercase tracking-wider text-violet-700">Date</span>
                    <input
                      type="date"
                      min={todayDate}
                      value={date}
                      onChange={(event) => setDate(event.target.value)}
                      className={searchInputClassName}
                    />
                  </label>

                  <div className="flex items-end">
                    <div className="w-full rounded-2xl border-[3px] border-red-500 p-1 shadow-[0_0_0_2px_rgba(220,38,38,0.25)]">
                      <button
                        type="submit"
                        onMouseEnter={() => setIsSearchHovered(true)}
                        onMouseLeave={() => setIsSearchHovered(false)}
                        onFocus={() => setIsSearchHovered(true)}
                        onBlur={() => setIsSearchHovered(false)}
                        className="group/btn relative h-14 w-full overflow-hidden rounded-xl bg-linear-to-r from-violet-600 via-purple-600 to-indigo-700 px-6 text-base font-bold text-white shadow-[0_10px_25px_-5px_rgba(79,70,229,0.4)] transition-all duration-300 hover:scale-[1.03] hover:shadow-[0_20px_35px_-8px_rgba(79,70,229,0.5)]"
                      >
                        <span className="relative z-10 flex items-center justify-center gap-2">
                          Search
                          <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover/btn:translate-x-1" />
                        </span>
                        <div className="absolute inset-0 -translate-x-full bg-linear-to-r from-indigo-700 via-purple-600 to-violet-600 opacity-0 transition-all duration-500 group-hover/btn:translate-x-0 group-hover/btn:opacity-100" />
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </section>

        {/* Enhanced Trust Cards */}
        <section className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {TRUST_POINTS.map((point) => {
            const Icon = point.icon;
            return (
              <article
                key={point.title}
                className="group rounded-3xl border border-violet-200/50 bg-white/80 p-6 shadow-md backdrop-blur-sm transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:border-violet-300/60"
              >
                <div className="inline-flex rounded-xl bg-linear-to-br from-violet-500 to-purple-600 p-3 text-white shadow-lg transition-transform duration-300 group-hover:scale-110">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-lg font-bold text-violet-950">{point.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-violet-800/70">{point.text}</p>
              </article>
            );
          })}
        </section>

        {/* Enhanced Popular Routes Section */}
        <section className="mt-20">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-600">Popular Routes</p>
              <h2 className="mt-2 text-4xl font-bold text-violet-950">Most Booked Routes</h2>
            </div>
          </div>

          {popularLoading ? (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="skeleton h-72 rounded-3xl" />
              ))}
            </div>
          ) : null}

          {!popularLoading && popularError ? (
            <div className="mt-8 rounded-2xl border border-red-200 bg-red-50/80 px-5 py-4 text-sm text-red-700 backdrop-blur-sm">
              {popularError}
            </div>
          ) : null}

          {!popularLoading && !popularError ? (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {popularRoutes.length > 0 ? (
                popularRoutes.map((route, index) => {
                  const tone = ROUTE_CARD_TONES[index % ROUTE_CARD_TONES.length];
                  const fareText = route?.minSeatPrice ? formatCurrency(route.minSeatPrice) : "No fare data";
                  const imageKey = buildRouteKey(route?.source, route?.destination);
                  const previewImage = routePreviewImageByKey.get(imageKey);

                  return (
                    <article
                      key={route.routeId || `${route.source}-${route.destination}`}
                      className="group overflow-hidden rounded-3xl border border-violet-200/50 bg-white shadow-md transition-all duration-300 hover:scale-[1.02] hover:shadow-xl"
                    >
                      <div className="relative h-40 overflow-hidden bg-violet-50">
                        {previewImage ? (
                          <img
                            src={previewImage}
                            alt={`${route.source} to ${route.destination}`}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                          />
                        ) : (
                          <div className={`h-full w-full bg-linear-to-r ${tone} transition-transform duration-500 group-hover:scale-110`} />
                        )}
                        <div className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-violet-800 shadow-md backdrop-blur-sm">
                          {fareText}
                        </div>
                      </div>

                      <div className="space-y-3 p-5">
                        <h3 className="text-lg font-bold text-violet-950">{route.source} → {route.destination}</h3>
                        <p className="text-sm text-violet-700/70">
                          {route?.bookingCount > 0
                            ? `${route.bookingCount}+ confirmed bookings`
                            : `${route?.scheduleCount || 0} active schedules`}
                        </p>
                        <button
                          type="button"
                          onClick={() => openPopularRoute(route)}
                          className="inline-flex w-full items-center justify-center rounded-xl bg-linear-to-r from-violet-600 to-purple-700 px-4 py-2.5 text-sm font-bold text-white shadow-md transition-all duration-300 hover:shadow-lg hover:scale-[1.02]"
                        >
                          Search Route
                          <ArrowRight className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
                        </button>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="rounded-3xl border border-violet-200/50 bg-white/80 px-6 py-5 text-sm text-violet-800/70 backdrop-blur-sm sm:col-span-2 lg:col-span-4">
                  No routes available yet. Add routes from the admin panel to show them here.
                </div>
              )}
            </div>
          ) : null}
        </section>

        {/* Enhanced Available Buses Section */}
        <section className="mt-20">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.2em] text-violet-600">Available Buses</p>
              <h2 className="mt-2 text-4xl font-bold text-violet-950">Choose Your Perfect Ride</h2>
            </div>
            <Link to="/search" className="group inline-flex items-center gap-2 text-sm font-bold text-violet-700 transition hover:text-violet-900">
              View all schedules
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
          </div>

          {featuredLoading ? (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="skeleton h-112.5 rounded-3xl" />
              ))}
            </div>
          ) : null}

          {!featuredLoading && featuredError ? (
            <div className="mt-8 rounded-2xl border border-red-200 bg-red-50/80 px-5 py-4 text-sm text-red-700 backdrop-blur-sm">
              {featuredError}
            </div>
          ) : null}

          {!featuredLoading && !featuredError ? (
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
                      className="group overflow-hidden rounded-3xl border border-violet-200/50 bg-white shadow-md transition-all duration-300 hover:scale-[1.02] hover:shadow-xl"
                    >
                      <div className="relative h-48 overflow-hidden bg-violet-50">
                        {busImage ? (
                          <img
                            src={busImage}
                            alt={title}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-110"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-violet-400 to-indigo-500 text-white">
                            <BusFront className="h-10 w-10" />
                          </div>
                        )}

                        <div className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1.5 text-xs font-bold text-violet-800 shadow-md backdrop-blur-sm">
                          {travelDateLabel}
                        </div>

                        <div className="absolute right-4 top-4 rounded-full bg-violet-700/95 px-3 py-1.5 text-xs font-bold text-white shadow-md backdrop-blur-sm">
                          {badgeLabel}
                        </div>
                      </div>

                      <div className="space-y-4 p-6">
                        <div>
                          <h3 className="text-xl font-bold text-violet-950">{title}</h3>
                          <p className="mt-1.5 text-sm text-violet-700/70">{sourceLabel} → {destinationLabel}</p>
                        </div>

                        <div className="rounded-xl border border-violet-200/50 bg-violet-50/60 px-4 py-3 text-sm text-violet-900">
                          <div className="inline-flex items-center gap-3 font-semibold">
                            <Clock3 className="h-4 w-4" />
                            <span>{departureTimeLabel}</span>
                            <ArrowRight className="h-4 w-4" />
                            <span>{arrivalTimeLabel}</span>
                          </div>
                        </div>

                        <div className="flex items-end justify-between gap-4">
                          <div>
                            <p className="text-xs font-bold uppercase tracking-wide text-violet-600/70">Starting from</p>
                            <div className="text-2xl font-extrabold text-violet-700">
                              {startingPrice ? formatCurrency(startingPrice) : "Price on seat map"}
                            </div>
                          </div>

                          <Link
                            to={`/seats/${schedule._id}`}
                            className="group/btn inline-flex items-center gap-2 rounded-xl bg-linear-to-r from-violet-600 to-purple-700 px-5 py-2.5 text-sm font-bold text-white shadow-md transition-all duration-300 hover:shadow-lg hover:scale-105"
                          >
                            View Seats
                            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover/btn:translate-x-1" />
                          </Link>
                        </div>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="rounded-3xl border border-violet-200/50 bg-white/80 px-6 py-5 text-sm text-violet-800/70 backdrop-blur-sm sm:col-span-2 lg:col-span-3">
                  No schedules found for today. Try searching by route and date.
                </div>
              )}
            </div>
          ) : null}
        </section>

        {/* Enhanced CTA Section */}
        <section className="relative mt-20 overflow-hidden rounded-[2.5rem] bg-linear-to-br from-violet-700 via-purple-700 to-indigo-800 p-12 text-center text-white shadow-[0_25px_50px_-12px_rgba(76,29,149,0.4)] sm:p-14">
          <div className="absolute inset-0 bg-[radial-gradient(circle,rgba(255,255,255,0.2)_1px,transparent_1px)] bg-size-[22px_22px] opacity-30" />
          
          <div className="relative z-10">
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-violet-200">Ready to travel?</p>
            <h2 className="mt-4 text-4xl font-bold sm:text-5xl">Find and Book Your Bus in Minutes</h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-violet-100/90 sm:text-lg">
              Compare schedules, pick seats, and confirm your trip smoothly from any device.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Link
                to="/search"
                className="group inline-flex items-center gap-3 rounded-xl bg-white px-6 py-3.5 text-base font-bold text-violet-700 shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl"
              >
                Search Buses
                <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
              </Link>
              <Link
                to="/login"
                className="inline-flex items-center rounded-xl border-2 border-white/30 px-6 py-3.5 text-base font-bold text-white backdrop-blur-sm transition-all duration-300 hover:bg-white/10 hover:scale-105"
              >
                Login to Continue
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* Enhanced Footer */}
      <footer className="relative z-10 mt-16 border-t border-violet-200/30 bg-linear-to-r from-violet-950 to-indigo-950 py-8 text-center">
        <p className="text-sm font-semibold tracking-wider text-violet-200">
          Developed By <span className="text-white">Prashant Dahal</span>
        </p>
        <p className="mt-2 text-xs text-violet-300/70">
          © {new Date().getFullYear()} SmartBus Booking. All rights reserved.
        </p>
      </footer>
    </div>
  );
}