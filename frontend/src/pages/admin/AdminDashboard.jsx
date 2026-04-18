import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BusFront,
  CalendarDays,
  DollarSign,
  Filter,
  Map as MapIcon,
  RefreshCw,
  Ticket,
  Users,
} from "lucide-react";
import {
  getAdminMonthlyBookings,
  getAdminRecentBookings,
  getAdminRevenue,
  getAdminStats,
  getAdminTopRoutes,
} from "../../services/admin.service";

const BookingsRevenueChart = lazy(() => import("../../components/admin/dashboard/BookingsRevenueChart"));

const DATE_RANGE_OPTIONS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "3m", label: "Last 3 months" },
  { value: "1y", label: "Last 1 year" },
];

const initialStats = {
  totalBuses: 0,
  totalRoutes: 0,
  totalSchedules: 0,
  totalUsers: 0,
  totalBookings: 0,
};

const initialSectionLoading = {
  stats: true,
  analytics: true,
  topRoutes: true,
  recentBookings: true,
};

const initialSectionErrors = {
  stats: "",
  analytics: "",
  topRoutes: "",
  recentBookings: "",
};

const formatNumber = (value) => Number(value || 0).toLocaleString();
const formatCurrency = (value) =>
  new Intl.NumberFormat("en-NP", {
    style: "currency",
    currency: "NPR",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

const formatDateTime = (value) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString();
};

const normalizeSeries = (rows, valueKey) => {
  if (!Array.isArray(rows)) return [];

  return rows
    .map((entry) => ({
      month: String(entry?.month || "").trim(),
      [valueKey]: Number(entry?.[valueKey]) || 0,
    }))
    .filter((entry) => entry.month);
};

const normalizeTopRoutes = (rows) => {
  if (!Array.isArray(rows)) return [];

  return rows
    .map((entry) => ({
      route: String(entry?.route || "Unknown route").trim() || "Unknown route",
      bookings: Number(entry?.bookings) || 0,
    }))
    .filter((entry) => entry.route);
};

const normalizeRecentBookings = (rows) => {
  if (!Array.isArray(rows)) return [];

  return rows.map((entry, index) => ({
    id: String(entry?.id || entry?._id || `booking-${index}`),
    user: String(entry?.user || "Guest").trim() || "Guest",
    route: String(entry?.route || "Unknown -> Unknown").trim() || "Unknown -> Unknown",
    seat: String(entry?.seat || "-").trim() || "-",
    price: Number(entry?.price) || 0,
    date: entry?.date || "",
  }));
};

const StatCardSkeleton = () => (
  <article className="admin-surface p-5">
    <div className="flex items-start justify-between">
      <div className="space-y-3">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-10 w-28" />
      </div>
      <div className="skeleton h-12 w-12 rounded-xl" />
    </div>
    <div className="mt-4 skeleton h-6 w-28 rounded-full" />
  </article>
);

const SectionError = ({ message }) => (
  <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{message}</div>
);

export default function AdminDashboard() {
  const [range, setRange] = useState("30d");
  const [stats, setStats] = useState(initialStats);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [monthlyBookings, setMonthlyBookings] = useState([]);
  const [monthlyRevenue, setMonthlyRevenue] = useState([]);
  const [topRoutes, setTopRoutes] = useState([]);
  const [recentBookings, setRecentBookings] = useState([]);
  const [sectionLoading, setSectionLoading] = useState(initialSectionLoading);
  const [sectionErrors, setSectionErrors] = useState(initialSectionErrors);
  const [refreshing, setRefreshing] = useState(false);

  const selectedRangeLabel =
    DATE_RANGE_OPTIONS.find((option) => option.value === range)?.label || DATE_RANGE_OPTIONS[1].label;

  const getErrorMessage = (error, fallbackMessage) =>
    error?.response?.data?.message || error?.message || fallbackMessage;

  const loadDashboard = useCallback(async ({ activeRange, manualRefresh = false } = {}) => {
    const rangeValue = activeRange || "30d";

    setRefreshing(manualRefresh);
    setSectionLoading(initialSectionLoading);
    setSectionErrors(initialSectionErrors);

    const runSectionTask = async (sectionKey, task, onSuccess, fallbackMessage) => {
      try {
        const data = await task();
        onSuccess(data);
      } catch (error) {
        setSectionErrors((prev) => ({
          ...prev,
          [sectionKey]: getErrorMessage(error, fallbackMessage),
        }));
      } finally {
        setSectionLoading((prev) => ({
          ...prev,
          [sectionKey]: false,
        }));
      }
    };

    await Promise.allSettled([
      runSectionTask(
        "stats",
        () => getAdminStats(rangeValue),
        (data) => {
          setStats({ ...initialStats, ...data });
        },
        "Failed to load stats"
      ),
      runSectionTask(
        "analytics",
        async () => {
          const [bookingsData, revenueData] = await Promise.all([
            getAdminMonthlyBookings(rangeValue),
            getAdminRevenue(rangeValue),
          ]);
          return { bookingsData, revenueData };
        },
        ({ bookingsData, revenueData }) => {
          setMonthlyBookings(normalizeSeries(bookingsData, "bookings"));
          setMonthlyRevenue(normalizeSeries(revenueData?.monthlyRevenue, "revenue"));
          setTotalRevenue(Number(revenueData?.totalRevenue) || 0);
        },
        "Failed to load bookings and revenue analytics"
      ),
      runSectionTask(
        "topRoutes",
        () => getAdminTopRoutes(5, rangeValue),
        (data) => {
          setTopRoutes(normalizeTopRoutes(data));
        },
        "Failed to load top routes"
      ),
      runSectionTask(
        "recentBookings",
        () => getAdminRecentBookings(10, rangeValue),
        (data) => {
          setRecentBookings(normalizeRecentBookings(data));
        },
        "Failed to load recent bookings"
      ),
    ]);

    setRefreshing(false);
  }, []);

  useEffect(() => {
    loadDashboard({ activeRange: range });
  }, [range, loadDashboard]);

  const chartData = useMemo(() => {
    const order = [];
    const merged = new Map();

    const upsert = (month, key, value) => {
      if (!month) return;
      if (!merged.has(month)) {
        merged.set(month, { month, bookings: 0, revenue: 0 });
        order.push(month);
      }
      const current = merged.get(month);
      merged.set(month, {
        ...current,
        [key]: Number(value) || 0,
      });
    };

    monthlyBookings.forEach((entry) => {
      upsert(entry.month, "bookings", entry.bookings);
    });

    monthlyRevenue.forEach((entry) => {
      upsert(entry.month, "revenue", entry.revenue);
    });

    return order.map((month) => merged.get(month));
  }, [monthlyBookings, monthlyRevenue]);

  const hasChartData = chartData.some((point) => point.bookings > 0 || point.revenue > 0);

  const latestPoint = chartData[chartData.length - 1] || { bookings: 0, revenue: 0 };
  const previousPoint = chartData[chartData.length - 2] || { bookings: 0, revenue: 0 };

  const bookingsDeltaPercent =
    previousPoint.bookings > 0
      ? ((latestPoint.bookings - previousPoint.bookings) / previousPoint.bookings) * 100
      : 0;

  const trendPositive = bookingsDeltaPercent >= 0;
  const TrendIcon = trendPositive ? ArrowUpRight : ArrowDownRight;
  const trendLabel = `${trendPositive ? "+" : ""}${bookingsDeltaPercent.toFixed(1)}%`;

  const bookingsTarget = Math.max(100, previousPoint.bookings ? Math.round(previousPoint.bookings * 1.15) : 200);
  const targetPercent = Math.min(100, Math.round((latestPoint.bookings / bookingsTarget) * 100));

  const statsCards = [
    {
      label: "Total Buses",
      value: formatNumber(stats.totalBuses),
      icon: BusFront,
      iconWrapClass: "bg-blue-50 text-blue-600",
    },
    {
      label: "Total Routes",
      value: formatNumber(stats.totalRoutes),
      icon: MapIcon,
      iconWrapClass: "bg-emerald-50 text-emerald-600",
    },
    {
      label: "Total Schedules",
      value: formatNumber(stats.totalSchedules),
      icon: CalendarDays,
      iconWrapClass: "bg-amber-50 text-amber-600",
    },
    {
      label: "Total Users",
      value: formatNumber(stats.totalUsers),
      icon: Users,
      iconWrapClass: "bg-violet-50 text-violet-600",
    },
    {
      label: "Total Bookings",
      value: formatNumber(stats.totalBookings),
      icon: Ticket,
      iconWrapClass: "bg-indigo-50 text-indigo-600",
    },
    {
      label: "Total Revenue",
      value: formatCurrency(totalRevenue),
      icon: DollarSign,
      iconWrapClass: "bg-teal-50 text-teal-600",
    },
  ];

  const topRouteMax = Math.max(1, ...topRoutes.map((route) => route.bookings));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Admin Analytics Dashboard</h2>
          <p className="text-sm text-slate-500">Filter and monitor operational KPIs in real time</p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <select
              value={range}
              onChange={(event) => setRange(event.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white pl-9 pr-9 text-sm font-medium text-slate-700 outline-none transition focus:border-blue-200 focus:ring-2 focus:ring-blue-100"
              aria-label="Select date range"
            >
              {DATE_RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => loadDashboard({ activeRange: range, manualRefresh: true })}
            disabled={refreshing}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <section className="space-y-3">
        {sectionErrors.stats ? <SectionError message={sectionErrors.stats} /> : null}

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sectionLoading.stats
            ? Array.from({ length: 6 }).map((_, idx) => <StatCardSkeleton key={`stat-skeleton-${idx}`} />)
            : statsCards.map((item) => {
                const Icon = item.icon;

                return (
                  <article key={item.label} className="admin-surface admin-surface-hover p-5">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-500">{item.label}</p>
                        <h3 className="mt-3 text-3xl font-bold leading-none text-slate-900">{item.value}</h3>
                      </div>
                      <div className={`grid h-12 w-12 place-items-center rounded-xl ${item.iconWrapClass}`}>
                        <Icon className="h-5 w-5" />
                      </div>
                    </div>

                    <div className="mt-4 flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                          trendPositive ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                        }`}
                      >
                        <TrendIcon className="h-3.5 w-3.5" />
                        {trendLabel}
                      </span>
                      <span className="text-xs text-slate-400">{selectedRangeLabel}</span>
                    </div>
                  </article>
                );
              })}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-3">
        <article className="admin-surface p-5 sm:p-6 xl:col-span-2">
          <div>
            <h3 className="text-2xl font-bold text-slate-900">Bookings vs Revenue</h3>
            <p className="mt-1 text-sm text-slate-500">Combined trend for the selected date range</p>
          </div>

          <div className="mt-6 h-80">
            {sectionLoading.analytics ? (
              <div className="h-full rounded-xl border border-slate-100 p-4">
                <div className="skeleton h-full w-full rounded-xl" />
              </div>
            ) : sectionErrors.analytics ? (
              <SectionError message={sectionErrors.analytics} />
            ) : !hasChartData ? (
              <div className="grid h-full place-items-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500">
                No analytics data available for {selectedRangeLabel.toLowerCase()}.
              </div>
            ) : (
              <Suspense
                fallback={
                  <div className="h-full rounded-xl border border-slate-100 p-4">
                    <div className="skeleton h-full w-full rounded-xl" />
                  </div>
                }
              >
                <BookingsRevenueChart
                  chartData={chartData}
                  formatCurrency={formatCurrency}
                  formatNumber={formatNumber}
                />
              </Suspense>
            )}
          </div>
        </article>

        <article className="admin-surface p-5 sm:p-6">
          <div>
            <h3 className="text-2xl font-bold text-slate-900">Performance Target</h3>
            <p className="mt-1 text-sm text-slate-500">Bookings target progress for the latest period</p>
          </div>

          <div
            className="mx-auto mt-4 grid h-52 w-52 place-items-center rounded-full"
            style={{
              background: `conic-gradient(rgb(37 99 235) ${targetPercent * 3.6}deg, rgb(226 232 240) 0deg)`,
            }}
          >
            <div className="grid h-44 w-44 place-items-center rounded-full bg-white shadow-inner">
              <div className="text-center">
                <p className="text-5xl font-bold leading-none text-slate-900">{targetPercent}%</p>
                <span
                  className={`mt-3 inline-flex rounded-full px-3 py-1 text-xs font-semibold ${
                    trendPositive ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"
                  }`}
                >
                  {trendLabel}
                </span>
              </div>
            </div>
          </div>

          <p className="mt-5 text-center text-sm text-slate-500">
            Latest period recorded {formatNumber(latestPoint.bookings)} bookings and {formatCurrency(latestPoint.revenue)} in revenue.
          </p>

          <div className="mt-6 grid grid-cols-3 divide-x divide-slate-100 rounded-xl border border-slate-100 bg-slate-50 px-3 py-4 text-center">
            <div>
              <p className="text-xs font-medium text-slate-500">Target</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{formatNumber(bookingsTarget)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Bookings</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{formatNumber(latestPoint.bookings)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-500">Revenue</p>
              <p className="mt-1 text-xl font-bold text-slate-900">{formatCurrency(totalRevenue)}</p>
            </div>
          </div>
        </article>
      </section>

      <section className="admin-surface p-5 sm:p-6">
        <div>
          <h3 className="text-2xl font-bold text-slate-900">Top Routes</h3>
          <p className="mt-1 text-sm text-slate-500">Most booked routes in {selectedRangeLabel.toLowerCase()}</p>
        </div>

        <div className="mt-5">
          {sectionLoading.topRoutes ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, idx) => (
                <div key={`top-route-skeleton-${idx}`} className="skeleton h-12 w-full rounded-xl" />
              ))}
            </div>
          ) : sectionErrors.topRoutes ? (
            <SectionError message={sectionErrors.topRoutes} />
          ) : topRoutes.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              No route analytics available for this range.
            </div>
          ) : (
            <div className="space-y-4">
              {topRoutes.map((item, index) => (
                <div key={`${item.route}-${index}`} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">#{index + 1} {item.route}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatNumber(item.bookings)} bookings</p>
                    </div>
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                      {formatNumber(item.bookings)}
                    </span>
                  </div>
                  <div className="mt-3 h-2 w-full rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-blue-500 transition-all duration-500"
                      style={{ width: `${Math.max(8, (item.bookings / topRouteMax) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="admin-surface p-5 sm:p-6">
        <div>
          <h3 className="text-2xl font-bold text-slate-900">Recent Bookings</h3>
          <p className="mt-1 text-sm text-slate-500">Latest 10 bookings in {selectedRangeLabel.toLowerCase()}</p>
        </div>

        <div className="mt-5 overflow-x-auto">
          {sectionLoading.recentBookings ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, idx) => (
                <div key={`recent-booking-skeleton-${idx}`} className="skeleton h-12 w-full rounded-xl" />
              ))}
            </div>
          ) : sectionErrors.recentBookings ? (
            <SectionError message={sectionErrors.recentBookings} />
          ) : recentBookings.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
              No recent bookings for this range.
            </div>
          ) : (
            <table className="w-full min-w-105 text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wider text-slate-500">
                  <th className="pb-3 font-semibold">User</th>
                  <th className="pb-3 font-semibold">Route</th>
                  <th className="pb-3 font-semibold">Seat</th>
                  <th className="pb-3 text-right font-semibold">Price</th>
                  <th className="pb-3 text-right font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {recentBookings.map((booking) => (
                  <tr key={booking.id} className="border-b border-slate-100 last:border-b-0">
                    <td className="py-3 text-slate-700">{booking.user}</td>
                    <td className="py-3 font-medium text-slate-900">{booking.route}</td>
                    <td className="py-3 text-slate-600">{booking.seat}</td>
                    <td className="py-3 text-right font-semibold text-slate-900">{formatCurrency(booking.price)}</td>
                    <td className="py-3 text-right text-slate-500">{formatDateTime(booking.date)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
