import {
  BarChart3,
  CalendarDays,
  RefreshCcw,
  Route,
  Ticket,
  TrendingUp,
  Wallet,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getOperatorBookings } from "../../services/operator.service";
import { formatCurrency } from "../../utils/helpers";

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const toDateKey = (booking) => {
  const scheduleDate = String(booking?.scheduleDate || "").trim();
  if (DATE_KEY_REGEX.test(scheduleDate)) return scheduleDate;

  const bookedAt = new Date(booking?.bookedAt || "");
  if (Number.isNaN(bookedAt.getTime())) return "";
  return bookedAt.toISOString().slice(0, 10);
};

const isRevenueBooking = (booking) => {
  const bookingStatus = String(booking?.status || "").trim().toLowerCase();
  const paymentStatus = String(booking?.paymentStatus || "").trim().toLowerCase();
  return bookingStatus === "confirmed" && paymentStatus === "paid";
};

const formatPercent = (value) => `${(Number(value) || 0).toFixed(1)}%`;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const [windowDays, setWindowDays] = useState(7);
  const [bookings, setBookings] = useState([]);
  const [summary, setSummary] = useState({
    totalBookings: 0,
    totalRevenue: 0,
    paidCount: 0,
    cancelledCount: 0,
  });

  const loadReports = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError("");

    try {
      const payload = await getOperatorBookings();
      setBookings(Array.isArray(payload?.items) ? payload.items : []);
      setSummary({
        totalBookings: toNumber(payload?.summary?.totalBookings),
        totalRevenue: toNumber(payload?.summary?.totalRevenue),
        paidCount: toNumber(payload?.summary?.paidCount),
        cancelledCount: toNumber(payload?.summary?.cancelledCount),
      });
    } catch (err) {
      setError(err?.response?.data?.message || err?.message || "Failed to load reports");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const scoped = useMemo(() => {
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (windowDays - 1));

    return bookings.filter((booking) => {
      const dateKey = toDateKey(booking);
      if (!DATE_KEY_REGEX.test(dateKey)) return false;
      const parsed = new Date(`${dateKey}T00:00:00`);
      return parsed >= start && parsed <= end;
    });
  }, [bookings, windowDays]);

  const metrics = useMemo(() => {
    const totalBookings = scoped.length;
    const paidBookings = scoped.filter((booking) => isRevenueBooking(booking)).length;
    const cancelledBookings = scoped.filter((booking) => String(booking?.status || "").trim().toLowerCase() === "cancelled").length;

    const seatsSold = scoped.reduce((sum, booking) => {
      if (!isRevenueBooking(booking)) return sum;
      return sum + (Array.isArray(booking?.seats) ? booking.seats.length : 0);
    }, 0);

    const revenue = scoped.reduce((sum, booking) => {
      if (!isRevenueBooking(booking)) return sum;
      return sum + toNumber(booking?.amount);
    }, 0);

    const activeRouteCount = new Set(
      scoped
        .map((booking) => String(booking?.route || "").trim())
        .filter(Boolean)
    ).size;

    return {
      totalBookings,
      paidBookings,
      cancelledBookings,
      seatsSold,
      revenue,
      activeRouteCount,
      cancelRate: totalBookings > 0 ? (cancelledBookings / totalBookings) * 100 : 0,
      averageTicket: paidBookings > 0 ? revenue / paidBookings : 0,
    };
  }, [scoped]);

  const trendRows = useMemo(() => {
    const range = [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (windowDays - 1));

    for (let offset = 0; offset < windowDays; offset += 1) {
      const current = new Date(start);
      current.setDate(start.getDate() + offset);
      const key = current.toISOString().slice(0, 10);
      range.push({
        key,
        day: current.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
        bookings: 0,
        revenue: 0,
        cancelled: 0,
      });
    }

    const rowByKey = new Map(range.map((row) => [row.key, row]));

    scoped.forEach((booking) => {
      const key = toDateKey(booking);
      const row = rowByKey.get(key);
      if (!row) return;

      row.bookings += 1;
      if (String(booking?.status || "").trim().toLowerCase() === "cancelled") {
        row.cancelled += 1;
      }
      if (isRevenueBooking(booking)) {
        row.revenue += toNumber(booking?.amount);
      }
    });

    return range;
  }, [scoped, windowDays]);

  const topRoutes = useMemo(() => {
    const routeMap = new Map();

    scoped.forEach((booking) => {
      const routeName = String(booking?.route || "Unknown route").trim() || "Unknown route";
      const stats = routeMap.get(routeName) || {
        route: routeName,
        bookings: 0,
        seats: 0,
        revenue: 0,
        cancelled: 0,
      };

      stats.bookings += 1;
      stats.seats += Array.isArray(booking?.seats) ? booking.seats.length : 0;
      if (String(booking?.status || "").trim().toLowerCase() === "cancelled") {
        stats.cancelled += 1;
      }
      if (isRevenueBooking(booking)) {
        stats.revenue += toNumber(booking?.amount);
      }

      routeMap.set(routeName, stats);
    });

    return [...routeMap.values()]
      .sort((a, b) => b.revenue - a.revenue || b.bookings - a.bookings || a.route.localeCompare(b.route))
      .slice(0, 8);
  }, [scoped]);

  const refresh = async () => {
    setRefreshing(true);
    await loadReports({ silent: true });
    setRefreshing(false);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Reports</h2>
          <p className="text-sm text-slate-500">Operational analytics from live booking and payment data.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-xl border border-slate-200 bg-white">
            {[7, 14, 30].map((days) => (
              <button
                key={days}
                type="button"
                onClick={() => setWindowDays(days)}
                className={[
                  "h-10 px-3 text-sm font-semibold transition",
                  windowDays === days
                    ? "bg-orange-500 text-white"
                    : "text-slate-700 hover:bg-slate-50",
                ].join(" ")}
              >
                {days}D
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={refresh}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            <RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="admin-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Revenue ({windowDays} Days)</p>
          <p className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
            <TrendingUp className="h-5 w-5 text-emerald-600" />
            {loading ? "..." : formatCurrency(metrics.revenue)}
          </p>
        </div>

        <div className="admin-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paid Bookings</p>
          <p className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Wallet className="h-5 w-5 text-blue-600" />
            {loading ? "..." : metrics.paidBookings}
          </p>
          <p className="mt-1 text-xs text-slate-500">All-time: {summary.paidCount}</p>
        </div>

        <div className="admin-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Seats Sold</p>
          <p className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Ticket className="h-5 w-5 text-orange-600" />
            {loading ? "..." : metrics.seatsSold}
          </p>
        </div>

        <div className="admin-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cancellation Rate</p>
          <p className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
            <XCircle className="h-5 w-5 text-rose-600" />
            {loading ? "..." : formatPercent(metrics.cancelRate)}
          </p>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="admin-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Average Ticket Value</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {loading ? "..." : formatCurrency(metrics.averageTicket)}
          </p>
        </div>

        <div className="admin-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active Routes ({windowDays} Days)</p>
          <p className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
            <Route className="h-5 w-5 text-cyan-600" />
            {loading ? "..." : metrics.activeRouteCount}
          </p>
        </div>

        <div className="admin-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">All-time Revenue</p>
          <p className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
            <BarChart3 className="h-5 w-5 text-violet-600" />
            {loading ? "..." : formatCurrency(summary.totalRevenue)}
          </p>
          <p className="mt-1 text-xs text-slate-500">{summary.totalBookings} all-time bookings</p>
        </div>
      </section>

      <section className="admin-surface p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900">Daily Trend</h3>
            <p className="text-xs text-slate-500">Bookings and revenue by travel date for the selected window.</p>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-semibold text-slate-600">
            <CalendarDays className="h-3.5 w-3.5" />
            Last {windowDays} days
          </span>
        </div>

        <div className="h-80">
          {loading ? (
            <div className="h-full w-full rounded-xl bg-slate-50 p-3">
              <div className="skeleton h-full w-full" />
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trendRows} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="4 4" />
                <XAxis dataKey="day" tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" tickLine={false} axisLine={false} width={34} allowDecimals={false} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tickLine={false}
                  axisLine={false}
                  width={56}
                  tickFormatter={(value) => `NPR ${Math.round(Number(value || 0) / 1000)}k`}
                />
                <Tooltip
                  cursor={{ fill: "rgba(148, 163, 184, 0.12)" }}
                  contentStyle={{ borderRadius: "12px", borderColor: "#e2e8f0" }}
                  formatter={(value, name) => {
                    if (name === "Revenue") return [formatCurrency(value), name];
                    return [String(value), name];
                  }}
                />
                <Bar yAxisId="left" dataKey="bookings" name="Bookings" fill="#2563eb" radius={[8, 8, 0, 0]} maxBarSize={30} />
                <Line yAxisId="right" dataKey="revenue" name="Revenue" type="monotone" stroke="#059669" strokeWidth={3} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      <section className="admin-surface overflow-hidden">
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">Top Routes ({windowDays} Days)</p>
          <p className="text-xs text-slate-500">{topRoutes.length} routes</p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Route</th>
                <th className="px-4 py-3 font-semibold">Bookings</th>
                <th className="px-4 py-3 font-semibold">Seats</th>
                <th className="px-4 py-3 font-semibold">Cancelled</th>
                <th className="px-4 py-3 font-semibold text-right">Revenue</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">Loading route stats...</td>
                </tr>
              ) : topRoutes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                    No booking data available for this period.
                  </td>
                </tr>
              ) : (
                topRoutes.map((row) => (
                  <tr key={row.route} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 font-semibold text-slate-900">{row.route}</td>
                    <td className="px-4 py-3 text-slate-700">{row.bookings}</td>
                    <td className="px-4 py-3 text-slate-700">{row.seats}</td>
                    <td className="px-4 py-3 text-slate-700">{row.cancelled}</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(row.revenue)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

