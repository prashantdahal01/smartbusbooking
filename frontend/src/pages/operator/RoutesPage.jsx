import {
  AlertCircle,
  BusFront,
  CalendarDays,
  Map as MapIcon,
  RefreshCcw,
  Route,
  Search,
  Ticket,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getOperatorBookings,
  getOperatorSchedules,
  getRouteCatalog,
} from "../../services/operator.service";
import { formatCurrency } from "../../utils/helpers";

const toDateTimeMs = (date, time) => {
  const dateText = String(date || "").trim();
  const timeText = String(time || "00:00").trim() || "00:00";
  if (!dateText) return NaN;
  return new Date(`${dateText}T${timeText}:00`).getTime();
};

const isRevenueBooking = (booking) => {
  const status = String(booking?.status || "").trim().toLowerCase();
  const paymentStatus = String(booking?.paymentStatus || "").trim().toLowerCase();
  return status === "confirmed" && paymentStatus === "paid";
};

const toRouteLabel = (route) => {
  const source = String(route?.source || route?.sourceCity?.name || "Unknown").trim();
  const destination = String(route?.destination || route?.destinationCity?.name || "Unknown").trim();
  return `${source} -> ${destination}`;
};

export default function RoutesPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [query, setQuery] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);

  const [schedules, setSchedules] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [routeCatalog, setRouteCatalog] = useState([]);

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError("");

    try {
      const [scheduleRows, bookingPayload, routes] = await Promise.all([
        getOperatorSchedules(),
        getOperatorBookings(),
        getRouteCatalog(),
      ]);

      setSchedules(Array.isArray(scheduleRows) ? scheduleRows : []);
      setBookings(Array.isArray(bookingPayload?.items) ? bookingPayload.items : []);
      setRouteCatalog(Array.isArray(routes) ? routes : []);
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to load route insights");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const routeRows = useMemo(() => {
    const statsByKey = new Map();
    const scheduleRouteById = new Map();

    const metadataByRouteId = new Map(
      routeCatalog
        .filter((route) => route?._id)
        .map((route) => [String(route._id), route])
    );
    const metadataByLabel = new Map(routeCatalog.map((route) => [toRouteLabel(route), route]));

    schedules.forEach((schedule) => {
      const routeId = String(schedule?.route?._id || schedule?.route || "").trim();
      const routeLabel = toRouteLabel(schedule?.route || {});
      const key = routeId || routeLabel;
      if (!key) return;

      const busName = String(schedule?.bus?.name || "").trim();
      const departureMs = toDateTimeMs(schedule?.date, schedule?.time);

      const row = statsByKey.get(key) || {
        key,
        routeId: routeId || "",
        route: routeLabel,
        scheduleCount: 0,
        activeSchedules: 0,
        upcomingSchedules: 0,
        bookingCount: 0,
        paidBookings: 0,
        cancelledBookings: 0,
        seatsBooked: 0,
        revenue: 0,
        buses: new Set(),
        firstDepartureMs: NaN,
        lastDepartureMs: NaN,
      };

      row.scheduleCount += 1;
      if (schedule?.isActive !== false) row.activeSchedules += 1;
      if (Number.isFinite(departureMs) && departureMs >= Date.now()) row.upcomingSchedules += 1;
      if (busName) row.buses.add(busName);

      if (Number.isFinite(departureMs)) {
        if (!Number.isFinite(row.firstDepartureMs) || departureMs < row.firstDepartureMs) {
          row.firstDepartureMs = departureMs;
        }
        if (!Number.isFinite(row.lastDepartureMs) || departureMs > row.lastDepartureMs) {
          row.lastDepartureMs = departureMs;
        }
      }

      statsByKey.set(key, row);

      const scheduleId = String(schedule?._id || "").trim();
      if (scheduleId) {
        scheduleRouteById.set(scheduleId, key);
      }
    });

    bookings.forEach((booking) => {
      const scheduleId = String(booking?.scheduleId || "").trim();
      const bookingRoute = String(booking?.route || "Unknown").trim() || "Unknown";
      const key = scheduleRouteById.get(scheduleId) || bookingRoute;

      const row = statsByKey.get(key) || {
        key,
        routeId: "",
        route: bookingRoute,
        scheduleCount: 0,
        activeSchedules: 0,
        upcomingSchedules: 0,
        bookingCount: 0,
        paidBookings: 0,
        cancelledBookings: 0,
        seatsBooked: 0,
        revenue: 0,
        buses: new Set(),
        firstDepartureMs: NaN,
        lastDepartureMs: NaN,
      };

      row.bookingCount += 1;
      row.seatsBooked += Array.isArray(booking?.seats) ? booking.seats.length : 0;

      if (String(booking?.status || "").trim().toLowerCase() === "cancelled") {
        row.cancelledBookings += 1;
      }
      if (isRevenueBooking(booking)) {
        row.paidBookings += 1;
        row.revenue += Number(booking?.amount) || 0;
      }

      statsByKey.set(key, row);
    });

    return [...statsByKey.values()]
      .map((row) => {
        const metadata = row.routeId
          ? metadataByRouteId.get(row.routeId)
          : metadataByLabel.get(row.route);

        return {
          ...row,
          distance: Number(metadata?.distance) || null,
          boardingStops: Array.isArray(metadata?.boardingPoints) ? metadata.boardingPoints.length : null,
          droppingStops: Array.isArray(metadata?.droppingPoints) ? metadata.droppingPoints.length : null,
          buses: [...row.buses].sort((a, b) => a.localeCompare(b)),
        };
      })
      .sort((a, b) => {
        if (b.revenue !== a.revenue) return b.revenue - a.revenue;
        if (b.bookingCount !== a.bookingCount) return b.bookingCount - a.bookingCount;
        if (b.scheduleCount !== a.scheduleCount) return b.scheduleCount - a.scheduleCount;
        return a.route.localeCompare(b.route);
      });
  }, [bookings, routeCatalog, schedules]);

  const visibleRows = useMemo(() => {
    const keyword = String(query || "").trim().toLowerCase();

    return routeRows.filter((row) => {
      if (activeOnly && row.activeSchedules === 0) return false;
      if (!keyword) return true;

      const haystack = `${row.route} ${row.buses.join(" ")}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [activeOnly, query, routeRows]);

  const summary = useMemo(() => {
    return {
      routesServed: routeRows.length,
      activeSchedules: routeRows.reduce((sum, row) => sum + row.activeSchedules, 0),
      upcomingSchedules: routeRows.reduce((sum, row) => sum + row.upcomingSchedules, 0),
      revenue: routeRows.reduce((sum, row) => sum + row.revenue, 0),
    };
  }, [routeRows]);

  const refresh = async () => {
    setRefreshing(true);
    await loadData({ silent: true });
    setRefreshing(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Routes</h2>
          <p className="text-sm text-slate-500">
            Live route performance built from your schedules and booking flow.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={refresh}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <Link
            to="/operator/schedules"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-semibold text-white transition hover:bg-orange-600"
          >
            <CalendarDays className="h-4 w-4" />
            Manage Schedules
          </Link>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="admin-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Routes Served</p>
          <p className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Route className="h-5 w-5 text-cyan-600" />
            {loading ? "..." : summary.routesServed}
          </p>
        </div>

        <div className="admin-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active Schedules</p>
          <p className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
            <MapIcon className="h-5 w-5 text-emerald-600" />
            {loading ? "..." : summary.activeSchedules}
          </p>
        </div>

        <div className="admin-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Upcoming Trips</p>
          <p className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Ticket className="h-5 w-5 text-orange-600" />
            {loading ? "..." : summary.upcomingSchedules}
          </p>
        </div>

        <div className="admin-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Route Revenue</p>
          <p className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
            <TrendingUp className="h-5 w-5 text-blue-600" />
            {loading ? "..." : formatCurrency(summary.revenue)}
          </p>
        </div>
      </section>

      <section className="admin-surface p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <label className="grid gap-1 text-sm">
            <span className="font-semibold text-slate-700">Search Route or Bus</span>
            <div className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
              <Search className="h-4 w-4 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Kathmandu -> Pokhara, bus name..."
                className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
              />
            </div>
          </label>

          <label className="inline-flex items-center gap-2 self-end text-xs font-semibold text-slate-600">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(event) => setActiveOnly(event.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-200"
            />
            Active routes only
          </label>
        </div>
      </section>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {!loading && !routeRows.length ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="inline-flex items-center gap-2 font-semibold">
            <AlertCircle className="h-4 w-4" />
            No route insights available yet.
          </p>
          <p className="mt-1 text-xs">Create schedules first so route demand and performance can be tracked.</p>
        </div>
      ) : null}

      <section className="admin-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">Route Performance</p>
          <p className="text-xs text-slate-500">{visibleRows.length} routes</p>
        </div>

        <div className="divide-y divide-slate-100 bg-white">
          {loading ? (
            Array.from({ length: 6 }).map((_, index) => (
              <div key={`route-skeleton-${index}`} className="px-4 py-4">
                <div className="skeleton h-4 w-1/3" />
                <div className="mt-2 skeleton h-3.5 w-2/3" />
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <div className="skeleton h-12 w-full" />
                  <div className="skeleton h-12 w-full" />
                  <div className="skeleton h-12 w-full" />
                  <div className="skeleton h-12 w-full" />
                </div>
              </div>
            ))
          ) : visibleRows.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">No routes match your filters.</div>
          ) : (
            visibleRows.map((row) => (
              <article key={row.key} className="px-4 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-base font-bold text-slate-900">{row.route}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {row.distance ? `${row.distance} km` : "Distance unavailable"}
                      {Number.isFinite(row.boardingStops) ? ` • ${row.boardingStops} boarding stops` : ""}
                      {Number.isFinite(row.droppingStops) ? ` • ${row.droppingStops} dropping stops` : ""}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Buses: {row.buses.length > 0 ? row.buses.join(", ") : "No bus assigned"}
                    </p>
                  </div>

                  <span
                    className={[
                      "inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                      row.activeSchedules > 0
                        ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100"
                        : "bg-slate-100 text-slate-600 ring-1 ring-slate-200",
                    ].join(" ")}
                  >
                    <MapIcon className="h-3.5 w-3.5" />
                    {row.activeSchedules > 0 ? "Operational" : "No Active Schedule"}
                  </span>
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs font-semibold text-slate-500">Schedules</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{row.scheduleCount}</p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs font-semibold text-slate-500">Upcoming</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{row.upcomingSchedules}</p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs font-semibold text-slate-500">Bookings</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{row.bookingCount}</p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs font-semibold text-slate-500">Seats Booked</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{row.seatsBooked}</p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs font-semibold text-slate-500">Revenue</p>
                    <p className="mt-1 text-sm font-bold text-slate-900">{formatCurrency(row.revenue)}</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                  <span>Paid bookings: {row.paidBookings}</span>
                  <span>Cancelled: {row.cancelledBookings}</span>
                </div>
              </article>
            ))
          )}
        </div>
      </section>

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
        Route creation and structural edits are admin-controlled. This page helps operators focus on demand and schedule execution.
      </div>
    </div>
  );
}

