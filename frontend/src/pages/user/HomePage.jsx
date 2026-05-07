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
    glow: "rgba(251, 191, 36, 0.35)",
  },
  {
    icon: Ticket,
    title: "Instant Ticket",
    text: "Receive booking confirmation quickly after successful payment.",
    accent: "text-emerald-400",
    bg: "bg-emerald-400/10 border-emerald-400/20",
    glow: "rgba(16, 185, 129, 0.34)",
  },
  {
    icon: BusFront,
    title: "Real-Time Seats",
    text: "Check seat availability live before confirming your booking.",
    accent: "text-sky-400",
    bg: "bg-sky-400/10 border-sky-400/20",
    glow: "rgba(14, 165, 233, 0.34)",
  },
];

const HERO_HEADLINE_TEXT = "Your Journey, Simplified.";
const HERO_HEADLINE_LEAD = "Your Journey, ";

const HERO_PARTICLES = [
  { left: 4, top: 18, size: 10, duration: 12, delay: 0.5 },
  { left: 13, top: 62, size: 6, duration: 14, delay: 1.2 },
  { left: 24, top: 26, size: 8, duration: 10, delay: 0.1 },
  { left: 31, top: 70, size: 5, duration: 15, delay: 1.9 },
  { left: 42, top: 18, size: 12, duration: 13, delay: 0.9 },
  { left: 55, top: 40, size: 7, duration: 16, delay: 2.3 },
  { left: 63, top: 74, size: 10, duration: 11, delay: 0.4 },
  { left: 71, top: 23, size: 6, duration: 14, delay: 1.6 },
  { left: 82, top: 56, size: 9, duration: 12, delay: 2.0 },
  { left: 91, top: 30, size: 7, duration: 15, delay: 0.2 },
];

const STATS = [
  { label: "Routes covered", value: 50, suffix: "+" },
  { label: "Daily departures", value: 200, suffix: "+" },
  { label: "Happy passengers", value: 10, suffix: "k+" },
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

const parseFlexibleTimeToMinutes = (value) => {
  const time24h = parseTimeToMinutes(value);
  if (time24h !== null) return time24h;

  const amPmMatch = String(value || "").trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!amPmMatch) return null;

  let hour = Number(amPmMatch[1]);
  const minute = Number(amPmMatch[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;

  const suffix = amPmMatch[3].toUpperCase();
  if (hour === 12) hour = 0;
  if (suffix === "PM") hour += 12;
  return (hour * 60) + minute;
};

const getDepartureCountdownLabel = (schedule, nowTs) => {
  const dateKey = normalizeDateKey(schedule?.date);
  const departureMinutes = parseFlexibleTimeToMinutes(schedule?.time);
  if (!dateKey || departureMinutes === null) return "Departure time TBD";

  const departureDate = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(departureDate.getTime())) return "Departure time TBD";
  departureDate.setHours(Math.floor(departureMinutes / 60), departureMinutes % 60, 0, 0);

  const diff = departureDate.getTime() - nowTs;
  if (diff <= -60 * 1000) return "Departed";
  if (diff <= 60 * 1000) return "Departs in under 1m";

  const totalMinutes = Math.ceil(diff / 60000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `Departs in ${days}d ${hours}h`;
  if (hours > 0) return `Departs in ${hours}h ${String(minutes).padStart(2, "0")}m`;
  return `Departs in ${minutes}m`;
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
  const [parallaxOffset, setParallaxOffset] = useState(0);
  const [typedHeadline, setTypedHeadline] = useState("");
  const [statsActivated, setStatsActivated] = useState(false);
  const [animatedStats, setAnimatedStats] = useState(() => STATS.map(() => 0));
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [customCursorEnabled, setCustomCursorEnabled] = useState(false);
  const [cursorPoint, setCursorPoint] = useState({ x: -120, y: -120 });

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const todayDate = `${yyyy}-${mm}-${dd}`;

  const inputClassName =
    "w-full rounded-xl border border-slate-300 bg-white/95 px-3 py-3 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-amber-500 focus:bg-white focus:ring-2 focus:ring-amber-500/20";
  const labelClassName =
    "mb-1.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500";

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

  const typedLead = typedHeadline.slice(0, HERO_HEADLINE_LEAD.length);
  const typedAccent = typedHeadline.length > HERO_HEADLINE_LEAD.length
    ? typedHeadline.slice(HERO_HEADLINE_LEAD.length)
    : "";
  const isTypingComplete = typedHeadline.length >= HERO_HEADLINE_TEXT.length;

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

  useEffect(() => {
    let charIndex = 0;
    setTypedHeadline("");
    const timer = window.setInterval(() => {
      charIndex += 1;
      setTypedHeadline(HERO_HEADLINE_TEXT.slice(0, charIndex));
      if (charIndex >= HERO_HEADLINE_TEXT.length) window.clearInterval(timer);
    }, 72);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowTs(Date.now());
    }, 30000);
    return () => {
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let rafId = 0;
    const onScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        setParallaxOffset(window.scrollY || window.pageYOffset || 0);
        rafId = 0;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  useEffect(() => {
    const nodes = Array.from(document.querySelectorAll("[data-reveal]"));
    if (!nodes.length) return undefined;

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    }, {
      threshold: 0.18,
      rootMargin: "0px 0px -8% 0px",
    });

    nodes.forEach((node) => observer.observe(node));
    return () => {
      observer.disconnect();
    };
  }, [popularRoutes.length, featuredSchedules.length]);

  useEffect(() => {
    const statsSection = document.querySelector("[data-stats-section]");
    if (!statsSection) return undefined;

    const observer = new IntersectionObserver((entries) => {
      const isVisible = entries.some((entry) => entry.isIntersecting);
      if (!isVisible) return;
      setStatsActivated(true);
      observer.disconnect();
    }, { threshold: 0.35 });

    observer.observe(statsSection);
    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!statsActivated) return undefined;

    const durationMs = 1400;
    const start = performance.now();
    let rafId = 0;

    const tick = (time) => {
      const progress = Math.min((time - start) / durationMs, 1);
      const eased = 1 - ((1 - progress) ** 3);
      setAnimatedStats(STATS.map((stat) => Math.round(stat.value * eased)));
      if (progress < 1) {
        rafId = window.requestAnimationFrame(tick);
      }
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [statsActivated]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px) and (pointer: fine)");
    const onMediaChange = () => setCustomCursorEnabled(media.matches);

    onMediaChange();
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onMediaChange);
      return () => media.removeEventListener("change", onMediaChange);
    }

    media.addListener(onMediaChange);
    return () => media.removeListener(onMediaChange);
  }, []);

  useEffect(() => {
    if (!customCursorEnabled) return undefined;

    let rafId = 0;
    const latest = { x: -120, y: -120 };
    const onMouseMove = (event) => {
      latest.x = event.clientX;
      latest.y = event.clientY;
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        setCursorPoint({ x: latest.x, y: latest.y });
        rafId = 0;
      });
    };

    window.addEventListener("mousemove", onMouseMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [customCursorEnabled]);

  const triggerRgbFlash = (event) => {
    const node = event?.currentTarget;
    if (!node?.classList) return;
    node.classList.remove("rgb-flash");
    void node.offsetWidth;
    node.classList.add("rgb-flash");
    window.setTimeout(() => {
      node.classList.remove("rgb-flash");
    }, 280);
  };

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

  const onSwap = (event) => {
    triggerRgbFlash(event);
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
    <div className="home-light-theme relative flex min-h-screen flex-col overflow-x-clip bg-white text-slate-900" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {customCursorEnabled && (
        <div
          className="pointer-events-none fixed z-90 hidden h-4 w-4 rounded-full bg-cyan-300/80 blur-[1px] lg:block"
          style={{
            left: cursorPoint.x - 8,
            top: cursorPoint.y - 8,
            boxShadow: "0 0 26px rgba(34, 211, 238, 0.75)",
          }}
        />
      )}

      {/* Ambient background glows */}
      <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
        <div
          className="absolute -top-64 left-1/4 h-125 w-125 rounded-full bg-amber-600/8 blur-[140px]"
          style={{ transform: `translate3d(0, ${parallaxOffset * 0.12}px, 0)` }}
        />
        <div
          className="absolute top-1/3 -right-40 h-100 w-100 rounded-full bg-emerald-600/8 blur-[120px]"
          style={{ transform: `translate3d(0, ${parallaxOffset * -0.09}px, 0)` }}
        />
        <div
          className="absolute bottom-0 left-0 h-75 w-150 rounded-full bg-cyan-500/10 blur-[100px]"
          style={{ transform: `translate3d(0, ${parallaxOffset * 0.07}px, 0)` }}
        />
      </div>

      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-4 pb-20 sm:px-6 lg:px-8">

        {/* ───────────── HERO ───────────── */}
        <section data-reveal className="reveal-section relative mx-auto mt-6 flex min-h-[calc(100vh-100px)] w-full max-w-6xl flex-col items-center justify-center overflow-hidden rounded-3xl border border-slate-200 shadow-2xl">

          {/* Hero background */}
          <Suspense fallback={<div className="absolute inset-0 bg-slate-100" />}>
            <HimalayaHeroScene searchHovered={isSearchHovered} lightMode className="hero-scene-light" />
          </Suspense>
          <div className="absolute inset-0 bg-linear-to-b from-white/22 via-white/18 to-white/42" />

          {/* Decorative grid overlay */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: "linear-gradient(rgba(255,255,255,0.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.5) 1px, transparent 1px)",
              backgroundSize: "60px 60px",
            }}
          />

          <div className="pointer-events-none absolute inset-0 z-1 overflow-hidden">
            {HERO_PARTICLES.map((particle, index) => (
              <span
                key={`${particle.left}-${particle.top}-${index}`}
                className="hero-particle"
                style={{
                  left: `${particle.left}%`,
                  top: `${particle.top}%`,
                  width: `${particle.size}px`,
                  height: `${particle.size}px`,
                  animationDuration: `${particle.duration}s`,
                  animationDelay: `-${particle.delay}s`,
                }}
              />
            ))}
          </div>

          <div className="relative z-10 w-full px-4 py-16 text-center sm:px-8">

            {/* Eyebrow badge */}
            <div className="mb-8 inline-flex items-center gap-2.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-5 py-2 text-xs font-bold uppercase tracking-[0.25em] text-amber-400 backdrop-blur-sm">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" style={{ animation: "pulse 2s infinite" }} />
              SmartBus Nepal
            </div>

            {/* Hero headline */}
            <h1
              className="text-6xl font-black leading-[0.95] tracking-tight text-slate-900 sm:text-7xl lg:text-8xl"
              style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}
            >
              <span>{typedLead}</span>
              <span className="relative inline-block">
                <span className="relative z-10 text-amber-400">{typedAccent}</span>
                {typedAccent ? <span className="absolute -bottom-1 left-0 right-0 h-3 bg-amber-400/15 blur-sm" /> : null}
                <span className={`ml-1 inline-block h-[0.92em] w-0.75 rounded-full bg-amber-300 align-[-0.06em] ${isTypingComplete ? "animate-[cursorBlink_1s_steps(2,end)_infinite]" : "animate-pulse"}`} />
              </span>
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-lg leading-relaxed text-slate-600 sm:text-xl">
              Book bus tickets across Nepal — fast, reliable, with real-time seat availability.
            </p>

            <div className="mx-auto mt-8 w-full max-w-4xl px-1">
              <div className="relative h-24 overflow-hidden rounded-2xl border border-cyan-400/20 bg-white/70 backdrop-blur-sm">
                <div className="absolute left-0 right-0 top-0 h-px bg-linear-to-r from-transparent via-cyan-300/50 to-transparent" />
                <div className="hero-bus-runner absolute bottom-7 -left-55 w-45 sm:w-55">
                  <div className="hero-bus-bob relative">
                    <div className="absolute -left-7 bottom-6 flex items-end gap-1">
                      <span className="smoke-puff" />
                      <span className="smoke-puff [animation-delay:-1.05s]" />
                      <span className="smoke-puff [animation-delay:-2.1s]" />
                    </div>

                    <div className="relative rounded-[20px] border border-cyan-300/40 bg-linear-to-r from-fuchsia-500/80 via-cyan-500/85 to-blue-500/85 px-2 pb-2 pt-2.5 shadow-[0_0_18px_rgba(6,182,212,0.5)]">
                      <div className="flex gap-1.5 px-1.5">
                        <span className="h-4 flex-1 rounded-md bg-slate-100/75" />
                        <span className="h-4 flex-1 rounded-md bg-slate-100/75" />
                        <span className="h-4 w-8 rounded-md bg-slate-100/75" />
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-slate-300/70" />

                      <div className="absolute -right-1.5 bottom-4 h-6 w-4 rounded-r-xl bg-cyan-200/85" />
                      <div className="headlight-glow absolute -right-10 bottom-4 h-8 w-10" />
                    </div>

                    <div className="absolute -bottom-2 left-6 h-8 w-8 rounded-full border-2 border-slate-600 bg-slate-700 shadow-[inset_0_0_0_3px_rgba(34,211,238,0.6)]">
                      <span className="wheel-spin" />
                    </div>
                    <div className="absolute -bottom-2 right-7 h-8 w-8 rounded-full border-2 border-slate-600 bg-slate-700 shadow-[inset_0_0_0_3px_rgba(34,211,238,0.6)]">
                      <span className="wheel-spin" />
                    </div>
                  </div>
                </div>

                <div className="absolute bottom-2 left-4 right-4 h-1 rounded-full bg-slate-300/80">
                  <div className="road-dash absolute inset-y-0 left-0 right-0" />
                </div>
              </div>
            </div>

            {/* ── Search card ── */}
            <div className="mx-auto mt-12 w-full max-w-4xl">
              <form
                onSubmit={onSearch}
                autoComplete="off"
                className="overflow-hidden rounded-2xl border border-slate-200 bg-white/90 shadow-[0_32px_64px_rgba(15,23,42,0.16)] backdrop-blur-xl"
              >
                {/* Form header bar */}
                <div className="border-b border-slate-200 bg-white/75 px-6 py-3.5 text-left">
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
                      <SwapButton
                        onClick={onSwap}
                        className="rgb-action rgb-action-solid h-12! w-12! border-slate-300! bg-white/95! text-slate-900! hover:text-slate-900! hover:border-cyan-300! focus:ring-cyan-400/30!"
                      />
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
                      onClick={triggerRgbFlash}
                      onMouseEnter={() => setIsSearchHovered(true)}
                      onMouseLeave={() => setIsSearchHovered(false)}
                      onFocus={() => setIsSearchHovered(true)}
                      onBlur={() => setIsSearchHovered(false)}
                      className="rgb-action rgb-action-solid group inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white/90 px-5 text-sm font-bold text-slate-900 transition-all duration-200"
                    >
                      Search
                      <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </button>
                  </div>
                </div>
              </form>
            </div>

            {/* Stats row */}
            <div data-stats-section className="mt-10 flex flex-wrap items-center justify-center gap-8">
              {STATS.map((stat, index) => (
                <div key={stat.label} className="text-center">
                  <div className="text-2xl font-black text-slate-900">{`${animatedStats[index]}${stat.suffix}`}</div>
                  <div className="mt-0.5 text-xs font-medium text-slate-400 uppercase tracking-wider">{stat.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ───────────── TRUST CARDS ───────────── */}
        <section data-reveal className="reveal-section mt-10 grid gap-4 sm:grid-cols-3">
          {TRUST_POINTS.map((point) => {
            const Icon = point.icon;
            return (
              <article
                key={point.title}
                className={`trust-card group rounded-2xl border bg-white/90 p-6 backdrop-blur-sm transition-all duration-300 ${point.bg}`}
                style={{ "--trust-glow": point.glow }}
              >
                <div className={`inline-flex rounded-xl border p-2.5 ${point.bg} ${point.accent}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 text-base font-bold text-slate-900">{point.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{point.text}</p>
              </article>
            );
          })}
        </section>

        {/* ───────────── POPULAR ROUTES ───────────── */}
        <section data-reveal className="reveal-section mt-24">

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="h-px w-8 bg-amber-500" />
                <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-400">Popular Routes</span>
              </div>
              <h2
                className="mt-2 text-4xl font-black text-slate-900 sm:text-5xl"
                style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}
              >
                Most Booked
              </h2>
            </div>
          </div>

          {popularLoading && (
            <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="h-64 animate-pulse rounded-2xl bg-slate-200" />
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
                      className="route-card group relative overflow-hidden rounded-2xl border border-slate-200 bg-white/95 transition-all duration-300 hover:border-slate-300"
                    >
                      {/* Image / gradient */}
                      <div className="relative h-36 overflow-hidden">
                        {previewImage ? (
                          <img
                            src={previewImage}
                            alt={`${route.source} to ${route.destination}`}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover brightness-95 transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className={`h-full w-full bg-linear-to-br ${tone} opacity-80 transition-transform duration-500 group-hover:scale-105`} />
                        )}
                        {/* Fare pill */}
                        <div className="absolute left-3 top-3 rounded-lg border border-slate-200 bg-white/90 px-2.5 py-1 text-xs font-bold text-amber-500 backdrop-blur-sm">
                          from {fareText}
                        </div>
                      </div>

                      <div className="p-4">
                        <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900">
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
                          onClick={(event) => {
                            triggerRgbFlash(event);
                            openPopularRoute(route);
                          }}
                          className="rgb-action group/btn mt-4 inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-white/95 py-2 text-xs font-bold text-slate-900 transition-all duration-200"
                        >
                          Search Route
                          <ArrowUpRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5" />
                        </button>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-slate-200 bg-white/85 px-6 py-5 text-sm text-slate-500 sm:col-span-2 lg:col-span-4">
                  No routes available yet. Add routes from the admin panel.
                </div>
              )}
            </div>
          )}
        </section>

        {/* ───────────── AVAILABLE BUSES ───────────── */}
        <section data-reveal className="reveal-section mt-24">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="h-px w-8 bg-emerald-500" />
                <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-emerald-400">Available Buses</span>
              </div>
              <h2
                className="mt-2 text-4xl font-black text-slate-900 sm:text-5xl"
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
                <div key={i} className="h-96 animate-pulse rounded-2xl bg-slate-200" />
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
                      className="route-card group overflow-hidden rounded-2xl border border-slate-200 bg-white/95 transition-all duration-300 hover:border-slate-300"
                    >
                      {/* Bus image */}
                      <div className="relative h-44 overflow-hidden bg-slate-100">
                        {busImage ? (
                          <img
                            src={busImage}
                            alt={title}
                            loading="lazy"
                            decoding="async"
                            className="h-full w-full object-cover brightness-95 transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-slate-100 to-slate-200">
                            <BusFront className="h-12 w-12 text-slate-600" />
                          </div>
                        )}
                        {/* Date chip */}
                        <div className="absolute left-3 top-3 rounded-lg border border-slate-200 bg-white/90 px-2.5 py-1 text-xs font-semibold text-slate-700 backdrop-blur-sm">
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
                          <h3 className="text-lg font-bold text-slate-900">{title}</h3>
                          <div className="mt-1 flex items-center gap-1.5 text-sm text-slate-400">
                            <span>{sourceLabel}</span>
                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                            <span>{destinationLabel}</span>
                          </div>
                        </div>

                        {/* Time row */}
                        <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-100 px-4 py-3">
                          <Clock3 className="h-4 w-4 shrink-0 text-slate-500" />
                          <span className="text-sm font-semibold text-slate-700">{departureTimeLabel}</span>
                          <div className="mx-1 h-px flex-1 border-t border-dashed border-slate-300" />
                          <span className="text-sm font-semibold text-slate-700">{arrivalTimeLabel}</span>
                        </div>
                        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-cyan-300/90">
                          {getDepartureCountdownLabel(schedule, nowTs)}
                        </p>

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
                            onClick={triggerRgbFlash}
                            className="rgb-action rgb-action-solid group/btn inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white/95 px-4 py-2.5 text-sm font-bold text-slate-900 transition-all duration-200"
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
                <div className="rounded-2xl border border-slate-200 bg-white/85 px-6 py-5 text-sm text-slate-500 sm:col-span-2 lg:col-span-3">
                  No schedules found for today. Try searching by route and date.
                </div>
              )}
            </div>
          )}
        </section>

        {/* ───────────── CTA BANNER ───────────── */}
        <section data-reveal className="reveal-section relative mt-24 overflow-hidden rounded-3xl border border-slate-200 bg-white/95">

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
              className="mt-5 text-4xl font-black text-slate-900 sm:text-5xl"
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
                onClick={triggerRgbFlash}
                className="rgb-action rgb-action-solid group inline-flex items-center gap-2.5 rounded-xl border border-slate-300 bg-white/95 px-7 py-3.5 text-base font-bold text-slate-900 transition-all duration-200"
              >
                Search Buses
                <ArrowRight className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </Link>
              <Link
                to="/login"
                onClick={triggerRgbFlash}
                className="rgb-action inline-flex items-center rounded-xl border border-slate-300 bg-white/95 px-7 py-3.5 text-base font-bold text-slate-900 transition-all duration-200"
              >
                Login to Continue
              </Link>
            </div>
          </div>
        </section>
      </main>

      <style>{`
        .home-light-theme {
          background-color: #f8fafc;
          color: #0f172a;
        }

        .home-light-theme .hero-scene-light canvas {
          filter: brightness(1.16) saturate(1.16) contrast(0.92);
        }

        .home-light-theme .bg-slate-950,
        .home-light-theme .bg-slate-950\/80,
        .home-light-theme .bg-slate-900,
        .home-light-theme .bg-slate-900\/90,
        .home-light-theme .bg-slate-900\/85,
        .home-light-theme .bg-slate-900\/70,
        .home-light-theme .bg-slate-900\/60,
        .home-light-theme .bg-slate-900\/45,
        .home-light-theme .bg-slate-800,
        .home-light-theme .bg-slate-800\/90,
        .home-light-theme .bg-slate-800\/80,
        .home-light-theme .bg-slate-800\/60,
        .home-light-theme .bg-slate-700,
        .home-light-theme .bg-slate-700\/70 {
          background-color: rgba(255, 255, 255, 0.92) !important;
        }

        .home-light-theme .border-slate-800,
        .home-light-theme .border-slate-700,
        .home-light-theme .border-slate-700\/60 {
          border-color: rgba(148, 163, 184, 0.45) !important;
        }

        .home-light-theme .text-white,
        .home-light-theme .text-slate-100,
        .home-light-theme .text-slate-200 {
          color: #0f172a !important;
        }

        .home-light-theme .text-slate-300,
        .home-light-theme .text-slate-400 {
          color: #475569 !important;
        }

        .home-light-theme .text-slate-500 {
          color: #64748b !important;
        }

        .home-light-theme .text-slate-600 {
          color: #94a3b8 !important;
        }

        @keyframes rgbPulse {
          0% { border-color: #ff0055; box-shadow: 0 0 8px #ff0055; }
          33% { border-color: #00ff55; box-shadow: 0 0 12px #00ff55; }
          66% { border-color: #0055ff; box-shadow: 0 0 8px #0055ff; }
          100% { border-color: #ff0055; box-shadow: 0 0 8px #ff0055; }
        }

        @keyframes rgbFlow {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }

        @keyframes rgbFlash {
          0% { opacity: 0.95; }
          100% { opacity: 0; }
        }

        @keyframes heroParticle {
          0% { transform: translate3d(0, 0, 0) scale(0.85); opacity: 0.25; }
          50% { opacity: 0.75; }
          100% { transform: translate3d(0, -26px, 0) scale(1.18); opacity: 0; }
        }

        @keyframes busTraverse {
          0% { transform: translateX(0); }
          100% { transform: translateX(calc(100vw + 420px)); }
        }

        @keyframes busBob {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }

        @keyframes wheelRotate {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }

        @keyframes smokeRise {
          0% { transform: translate3d(0, 0, 0) scale(0.45); opacity: 0.66; }
          100% { transform: translate3d(-24px, -22px, 0) scale(1.25); opacity: 0; }
        }

        @keyframes roadShift {
          0% { background-position-x: 0; }
          100% { background-position-x: 40px; }
        }

        @keyframes headlightPulse {
          0%, 100% { opacity: 0.35; transform: scaleX(0.95); }
          50% { opacity: 0.9; transform: scaleX(1.12); }
        }

        @keyframes cursorBlink {
          0%, 48% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }

        .rgb-action {
          position: relative;
          overflow: hidden;
          isolation: isolate;
          animation: rgbPulse 4s linear infinite;
          transition: transform 220ms ease, filter 220ms ease, box-shadow 220ms ease;
        }

        .rgb-action::before {
          content: "";
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          pointer-events: none;
          background: linear-gradient(120deg, #ff0055, #00ff55, #0055ff, #ff0055);
          background-size: 240% 240%;
          opacity: 0.14;
          filter: blur(8px);
          animation: rgbFlow 4s linear infinite;
          z-index: 0;
        }

        .rgb-action > * {
          position: relative;
          z-index: 1;
        }

        .rgb-action:hover {
          transform: scale(1.02);
          filter: brightness(1.08);
          box-shadow: 0 0 22px rgba(56, 189, 248, 0.38);
        }

        .rgb-action:active {
          transform: scale(0.97);
        }

        .rgb-action-solid {
          color: rgb(15 23 42);
        }

        .rgb-action.rgb-flash::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: inherit;
          pointer-events: none;
          z-index: 2;
          background: radial-gradient(circle at 50% 50%, rgba(255,255,255,0.85), rgba(255,255,255,0));
          animation: rgbFlash 280ms ease-out;
        }

        .hero-particle {
          position: absolute;
          border-radius: 9999px;
          background: radial-gradient(circle, rgba(34, 211, 238, 0.95) 0%, rgba(244, 114, 182, 0.6) 45%, rgba(34, 211, 238, 0) 100%);
          animation-name: heroParticle;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }

        .hero-bus-runner {
          will-change: transform;
          animation: busTraverse 13s linear infinite;
        }

        .hero-bus-bob {
          animation: busBob 820ms ease-in-out infinite;
        }

        .smoke-puff {
          height: 11px;
          width: 11px;
          border-radius: 9999px;
          background: radial-gradient(circle, rgba(226, 232, 240, 0.72) 0%, rgba(148, 163, 184, 0.16) 100%);
          animation: smokeRise 3s ease-out infinite;
        }

        .headlight-glow {
          pointer-events: none;
          background: radial-gradient(circle at 0% 50%, rgba(250, 204, 21, 0.6) 0%, rgba(250, 204, 21, 0.28) 45%, rgba(250, 204, 21, 0) 100%);
          animation: headlightPulse 1.8s ease-in-out infinite;
        }

        .wheel-spin {
          position: absolute;
          inset: 5px;
          border-radius: inherit;
          border: 2px solid rgba(125, 211, 252, 0.9);
          animation: wheelRotate 700ms linear infinite;
        }

        .wheel-spin::before,
        .wheel-spin::after {
          content: "";
          position: absolute;
          left: 50%;
          top: 50%;
          background: rgba(125, 211, 252, 0.9);
          transform: translate(-50%, -50%);
        }

        .wheel-spin::before {
          height: 2px;
          width: 100%;
        }

        .wheel-spin::after {
          height: 100%;
          width: 2px;
        }

        .road-dash {
          background-image: repeating-linear-gradient(
            90deg,
            rgba(34, 211, 238, 0.95) 0 16px,
            rgba(34, 211, 238, 0) 16px 34px
          );
          animation: roadShift 1.1s linear infinite;
        }

        .reveal-section {
          opacity: 0;
          transform: translateY(32px);
          transition: opacity 700ms ease, transform 700ms cubic-bezier(0.2, 0.7, 0.2, 1);
        }

        .reveal-section.is-visible {
          opacity: 1;
          transform: translateY(0);
        }

        .route-card {
          transition: transform 320ms cubic-bezier(0.2, 0.7, 0.2, 1), box-shadow 320ms ease;
        }

        .route-card:hover {
          transform: translateY(-8px);
          box-shadow: 0 24px 40px -22px rgba(34, 211, 238, 0.25), 0 16px 30px -20px rgba(15, 23, 42, 0.2);
        }

        .trust-card {
          transition: transform 260ms ease, box-shadow 260ms ease, border-color 260ms ease;
        }

        .trust-card:hover {
          transform: translateY(-6px);
          box-shadow: 0 0 0 1px var(--trust-glow), 0 24px 40px -26px var(--trust-glow);
        }

        @media (max-width: 640px) {
          .hero-bus-runner {
            animation-duration: 11s;
          }

          .route-card:hover,
          .trust-card:hover {
            transform: translateY(-4px);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .rgb-action,
          .rgb-action::before,
          .hero-particle,
          .hero-bus-runner,
          .hero-bus-bob,
          .smoke-puff,
          .headlight-glow,
          .wheel-spin,
          .road-dash,
          .reveal-section {
            animation: none !important;
            transition: none !important;
          }

          .reveal-section {
            opacity: 1;
            transform: none;
          }
        }
      `}</style>

      {/* ───────────── FOOTER ───────────── */}
      <footer className="relative z-10 mt-20 border-t border-slate-200 bg-white py-8 text-center">
        <p className="text-sm font-semibold text-slate-400">
          Developed by <span className="font-bold text-slate-900">Prashant Dahal</span>
        </p>
        <p className="mt-1.5 text-xs text-slate-600">
          © {new Date().getFullYear()} SmartBus Booking. All rights reserved.
        </p>
      </footer>
    </div>
  );
}