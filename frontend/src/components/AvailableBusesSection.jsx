import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, BusFront, Clock3, MapPin, Calendar, Users } from "lucide-react";
import { getBusTypeLabels } from "../utils/busTypeUtils";
import { formatCurrency, getBusImageUrl } from "../utils/helpers";

/* ── helpers (duplicated minimal subset to keep component self-contained) ── */

const normalizeDateKey = (value) => {
  const raw = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return "";
  return raw;
};

const toTitleLabel = (value) =>
  String(value || "")
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
  return hour * 60 + minute;
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
  return hour * 60 + minute;
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

const formatShortDateTab = (dateKey) => {
  const safeKey = normalizeDateKey(dateKey);
  if (!safeKey) return "TBD";
  const date = new Date(`${safeKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return safeKey;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.getTime() === today.getTime()) return "Today";
  if (date.getTime() === tomorrow.getTime()) return "Tomorrow";

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
};

const CARDS_PER_PAGE = 6;

/* ── Main Component ── */

export default function AvailableBusesSection({
  featuredSchedules,
  featuredLoading,
  featuredError,
  nowTs,
  triggerRgbFlash,
}) {
  const [activeDate, setActiveDate] = useState(null);

  // Group schedules by date
  const { dateKeys, schedulesByDate, totalCount } = useMemo(() => {
    const schedules = Array.isArray(featuredSchedules) ? featuredSchedules : [];
    const byDate = new Map();
    schedules.forEach((s) => {
      const key = normalizeDateKey(s?.date) || "unknown";
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key).push(s);
    });
    return {
      dateKeys: [...byDate.keys()],
      schedulesByDate: byDate,
      totalCount: schedules.length,
    };
  }, [featuredSchedules]);

  // Auto-select first date if none selected
  const selectedDate = activeDate && schedulesByDate.has(activeDate) ? activeDate : dateKeys[0] || null;
  const visibleSchedules = selectedDate ? (schedulesByDate.get(selectedDate) || []).slice(0, CARDS_PER_PAGE) : [];
  const totalForDate = selectedDate ? (schedulesByDate.get(selectedDate) || []).length : 0;
  const hasMore = totalForDate > CARDS_PER_PAGE;

  return (
    <section data-reveal className="reveal-section mt-24">
      {/* Section header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-px w-8 bg-emerald-500" />
            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-emerald-400">
              Available Buses
            </span>
          </div>
          <h2
            className="mt-2 text-4xl font-black text-slate-900 sm:text-5xl"
            style={{ fontFamily: "'DM Serif Display', Georgia, serif" }}
          >
            Choose Your Ride
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            {totalCount > 0
              ? `${totalCount} upcoming departure${totalCount !== 1 ? "s" : ""} across ${dateKeys.length} date${dateKeys.length !== 1 ? "s" : ""}`
              : "Browse upcoming bus departures"}
          </p>
        </div>
        <Link
          to="/search"
          className="group inline-flex items-center gap-1.5 text-sm font-bold text-slate-400 transition hover:text-amber-400"
        >
          View all schedules
          <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </div>

      {/* Date tabs */}
      {!featuredLoading && !featuredError && dateKeys.length > 1 && (
        <div className="mt-6 flex flex-wrap gap-2">
          {dateKeys.map((dateKey) => {
            const isActive = dateKey === selectedDate;
            const count = (schedulesByDate.get(dateKey) || []).length;
            return (
              <button
                key={dateKey}
                type="button"
                onClick={() => setActiveDate(dateKey)}
                className={`
                  available-buses-tab inline-flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-bold transition-all duration-200
                  ${isActive
                    ? "border-emerald-400/50 bg-emerald-500/10 text-emerald-600 shadow-[0_0_12px_rgba(16,185,129,0.15)]"
                    : "border-slate-200 bg-white/80 text-slate-500 hover:border-slate-300 hover:bg-white hover:text-slate-700"
                  }
                `}
              >
                <Calendar className="h-3 w-3" />
                <span>{formatShortDateTab(dateKey)}</span>
                <span
                  className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold ${
                    isActive
                      ? "bg-emerald-500/20 text-emerald-700"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Loading skeleton */}
      {featuredLoading && (
        <div className="mt-8 space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl bg-slate-200" />
          ))}
        </div>
      )}

      {/* Error state */}
      {!featuredLoading && featuredError && (
        <div className="mt-6 rounded-xl border border-rose-800/50 bg-rose-900/30 px-5 py-4 text-sm text-rose-400">
          {featuredError}
        </div>
      )}

      {/* Schedule cards */}
      {!featuredLoading && !featuredError && (
        <div className="mt-6 space-y-3">
          {visibleSchedules.length > 0 ? (
            <>
              {visibleSchedules.map((schedule, idx) => (
                <ScheduleRow
                  key={schedule._id}
                  schedule={schedule}
                  nowTs={nowTs}
                  triggerRgbFlash={triggerRgbFlash}
                  animDelay={idx * 60}
                />
              ))}

              {/* "View more" footer */}
              {hasMore && (
                <div className="flex justify-center pt-3">
                  <Link
                    to="/search"
                    onClick={triggerRgbFlash}
                    className="rgb-action rgb-action-solid group inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white/95 px-6 py-2.5 text-sm font-bold text-slate-900 transition-all duration-200"
                  >
                    View {totalForDate - CARDS_PER_PAGE} more departure{totalForDate - CARDS_PER_PAGE !== 1 ? "s" : ""}
                    <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                  </Link>
                </div>
              )}
            </>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white/85 px-6 py-8 text-center text-sm text-slate-500">
              <BusFront className="mx-auto mb-3 h-10 w-10 text-slate-300" />
              <p className="font-semibold text-slate-700">No schedules found</p>
              <p className="mt-1 text-slate-400">Try searching by route and date for more options.</p>
            </div>
          )}
        </div>
      )}

      <style>{`
        .available-buses-tab:active {
          transform: scale(0.97);
        }
        .schedule-row {
          opacity: 0;
          transform: translateY(12px);
          animation: scheduleRowIn 400ms ease forwards;
        }
        @keyframes scheduleRowIn {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </section>
  );
}

/* ── Compact Schedule Row ── */

function ScheduleRow({ schedule, nowTs, triggerRgbFlash, animDelay = 0 }) {
  const busImage = getBusImageUrl(schedule?.bus, "bus");
  const title = String(schedule?.bus?.name || "Bus Service").trim();
  const sourceLabel = String(schedule?.route?.source || "").trim();
  const destinationLabel = String(schedule?.route?.destination || "").trim();
  const travelDateLabel = formatDateLabel(schedule?.date);
  const departureTimeLabel = formatTimeLabel(schedule?.time);
  const arrivalTimeLabel = getArrivalTimeLabel(schedule);
  const badgeLabel = getBusTypeLabels(schedule?.bus)[0] || toTitleLabel(schedule?.bus?.type) || "Bus";
  const startingPrice = getStartingPrice(schedule);
  const countdownLabel = getDepartureCountdownLabel(schedule, nowTs);
  const isDeparted = countdownLabel === "Departed";

  return (
    <article
      className="schedule-row route-card group flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/95 transition-all duration-300 hover:border-slate-300 sm:flex-row"
      style={{ animationDelay: `${animDelay}ms` }}
    >
      {/* Image column */}
      <div className="relative h-44 w-full shrink-0 overflow-hidden bg-slate-100 sm:h-auto sm:w-48 md:w-56">
        {busImage ? (
          <img
            src={busImage}
            alt={title}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover brightness-95 transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200">
            <BusFront className="h-10 w-10 text-slate-400" />
          </div>
        )}
        {/* Type badge overlay */}
        <div className="absolute left-2.5 top-2.5 rounded-lg bg-amber-500/90 px-2 py-0.5 text-[10px] font-bold text-slate-950 uppercase tracking-wider backdrop-blur-sm">
          {badgeLabel}
        </div>
      </div>

      {/* Content column */}
      <div className="flex min-w-0 flex-1 flex-col justify-between p-4 sm:p-5">
        {/* Top row: title + route */}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-bold text-slate-900 sm:text-lg">{title}</h3>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400 sm:text-sm">
              <MapPin className="h-3 w-3 shrink-0 text-emerald-500" />
              <span className="truncate">{sourceLabel}</span>
              <ArrowRight className="h-3 w-3 shrink-0 text-amber-500" />
              <span className="truncate">{destinationLabel}</span>
            </div>
          </div>
          {/* Price */}
          <div className="shrink-0 text-right">
            {startingPrice ? (
              <>
                <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">From</p>
                <div className="text-xl font-black text-amber-500 sm:text-2xl">
                  {formatCurrency(startingPrice)}
                </div>
              </>
            ) : (
              <span className="text-xs font-semibold text-slate-400">See seat map</span>
            )}
          </div>
        </div>

        {/* Bottom row: time details + CTA */}
        <div className="mt-3 flex flex-wrap items-center gap-3 sm:gap-4">
          {/* Time pills */}
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
            <Clock3 className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="text-xs font-semibold text-slate-700">{departureTimeLabel}</span>
            <div className="h-px w-3 bg-slate-300" />
            <span className="text-xs font-semibold text-slate-700">{arrivalTimeLabel}</span>
          </div>

          {/* Date */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Calendar className="h-3 w-3" />
            <span>{travelDateLabel}</span>
          </div>

          {/* Countdown */}
          <span
            className={`text-[10px] font-bold uppercase tracking-wider ${
              isDeparted ? "text-rose-400" : "text-emerald-500"
            }`}
          >
            {countdownLabel}
          </span>

          {/* Spacer */}
          <div className="hidden flex-1 sm:block" />

          {/* CTA */}
          <Link
            to={`/seats/${schedule._id}`}
            onClick={triggerRgbFlash}
            className="rgb-action rgb-action-solid group/btn inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white/95 px-4 py-2 text-xs font-bold text-slate-900 transition-all duration-200 sm:text-sm"
          >
            View Seats
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover/btn:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </article>
  );
}
