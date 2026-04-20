import {
	AlertCircle,
	BusFront,
	CalendarDays,
	Clock3,
	RefreshCcw,
	Route,
	Ticket,
	Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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
import StatsCard from "../../components/operator/StatsCard";
import { getOperatorDashboardData } from "../../services/operator.service";
import { formatCurrency } from "../../utils/helpers";

const toDateTimeMs = (date, time) => {
	const dateText = String(date || "").trim();
	const timeText = String(time || "00:00").trim() || "00:00";
	if (!dateText) return NaN;
	return new Date(`${dateText}T${timeText}:00`).getTime();
};

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const todayKey = () => {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

const isRevenueBooking = (booking) => {
	const status = String(booking?.status || "").trim().toLowerCase();
	const paymentStatus = String(booking?.paymentStatus || "").trim().toLowerCase();
	return status === "confirmed" && paymentStatus === "paid";
};

const toBookingDateKey = (booking) => {
	const scheduleDate = String(booking?.scheduleDate || "").trim();
	if (DATE_KEY_REGEX.test(scheduleDate)) return scheduleDate;

	const parsed = new Date(booking?.bookedAt || "");
	if (Number.isNaN(parsed.getTime())) return "";
	return parsed.toISOString().slice(0, 10);
};

const formatDateLabel = (value) => {
	const text = String(value || "").trim();
	if (!text) return "-";

	if (DATE_KEY_REGEX.test(text)) {
		const parsed = new Date(`${text}T00:00:00`);
		if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleDateString();
		return text;
	}

	const parsed = new Date(text);
	if (!Number.isNaN(parsed.getTime())) return parsed.toLocaleString();
	return text;
};

export default function OperatorDashboard() {
	const navigate = useNavigate();

	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState("");
	const [buses, setBuses] = useState([]);
	const [schedules, setSchedules] = useState([]);
	const [bookings, setBookings] = useState([]);
	const [summary, setSummary] = useState({
		totalBookings: 0,
		totalRevenue: 0,
		paidCount: 0,
		cancelledCount: 0,
		byBus: [],
		byDay: [],
	});

	const loadDashboard = useCallback(async ({ silent = false } = {}) => {
		if (!silent) setLoading(true);
		setError("");

		try {
			const data = await getOperatorDashboardData();
			setBuses(data.buses);
			setSchedules(data.schedules);
			setBookings(data.bookings);
			setSummary(data.bookingSummary);
		} catch (err) {
			setError(err?.response?.data?.message || err?.message || "Failed to load operator dashboard");
		} finally {
			if (!silent) setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadDashboard();
	}, [loadDashboard]);

	const activeSchedules = useMemo(
		() => schedules.filter((schedule) => schedule?.isActive !== false).length,
		[schedules]
	);

	const upcomingSchedules = useMemo(() => {
		const now = Date.now();

		return schedules
			.filter((schedule) => schedule?.isActive !== false)
			.map((schedule) => ({
				...schedule,
				departureMs: toDateTimeMs(schedule?.date, schedule?.time),
			}))
			.filter((schedule) => Number.isFinite(schedule.departureMs) && schedule.departureMs >= now)
			.sort((a, b) => a.departureMs - b.departureMs)
			.slice(0, 5);
	}, [schedules]);

	const recentBookings = useMemo(
		() => [...bookings]
			.sort((a, b) => new Date(b?.bookedAt || 0).getTime() - new Date(a?.bookedAt || 0).getTime())
			.slice(0, 7),
		[bookings]
	);

	const liveMetrics = useMemo(() => {
		const today = todayKey();

		const todayRows = bookings.filter((booking) => toBookingDateKey(booking) === today);
		const todayBookings = todayRows.length;
		const todayRevenue = todayRows.reduce((sum, booking) => {
			if (!isRevenueBooking(booking)) return sum;
			return sum + (Number(booking?.amount) || 0);
		}, 0);

		const pendingPayments = bookings.filter((booking) => String(booking?.paymentStatus || "").trim().toLowerCase() === "pending").length;
		const cancelledBookings = bookings.filter((booking) => String(booking?.status || "").trim().toLowerCase() === "cancelled").length;
		const cancellationRate = bookings.length > 0 ? (cancelledBookings / bookings.length) * 100 : 0;

		const averageTicket = summary?.paidCount > 0
			? (Number(summary?.totalRevenue || 0) / Number(summary?.paidCount || 0))
			: 0;

		return {
			todayBookings,
			todayRevenue,
			pendingPayments,
			cancelledBookings,
			cancellationRate,
			averageTicket,
		};
	}, [bookings, summary]);

	const trendRows = useMemo(() => {
		const windowDays = 7;
		const start = new Date();
		start.setHours(0, 0, 0, 0);
		start.setDate(start.getDate() - (windowDays - 1));

		const range = [];
		for (let offset = 0; offset < windowDays; offset += 1) {
			const current = new Date(start);
			current.setDate(start.getDate() + offset);
			range.push({
				key: current.toISOString().slice(0, 10),
				day: current.toLocaleDateString(undefined, { month: "short", day: "numeric" }),
				bookings: 0,
				revenue: 0,
			});
		}

		const rowByKey = new Map(range.map((row) => [row.key, row]));
		bookings.forEach((booking) => {
			const key = toBookingDateKey(booking);
			const row = rowByKey.get(key);
			if (!row) return;

			row.bookings += 1;
			if (isRevenueBooking(booking)) {
				row.revenue += Number(booking?.amount) || 0;
			}
		});

		return range;
	}, [bookings]);

	const routePerformance = useMemo(() => {
		const map = new Map();

		bookings.forEach((booking) => {
			const routeLabel = String(booking?.route || "Unknown route").trim() || "Unknown route";
			const row = map.get(routeLabel) || {
				route: routeLabel,
				bookings: 0,
				paid: 0,
				revenue: 0,
				seats: 0,
			};

			row.bookings += 1;
			row.seats += Array.isArray(booking?.seats) ? booking.seats.length : 0;
			if (isRevenueBooking(booking)) {
				row.paid += 1;
				row.revenue += Number(booking?.amount) || 0;
			}

			map.set(routeLabel, row);
		});

		return [...map.values()]
			.sort((a, b) => b.revenue - a.revenue || b.bookings - a.bookings || a.route.localeCompare(b.route))
			.slice(0, 6);
	}, [bookings]);

	const refresh = async () => {
		setRefreshing(true);
		await loadDashboard({ silent: true });
		setRefreshing(false);
	};

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 className="text-2xl font-bold text-slate-900">Operator Dashboard</h2>
					<p className="text-sm text-slate-500">
						Monitor your buses, trips, bookings, and revenue in one place.
					</p>
				</div>
				<div className="flex items-center gap-2">
					<div className="inline-flex rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
						{new Date().toLocaleDateString()}
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
				<StatsCard label="My Buses" value={buses.length} icon={BusFront} accent="blue" />
				<StatsCard label="Active Schedules" value={activeSchedules} icon={CalendarDays} accent="emerald" />
				<StatsCard label="Upcoming Trips" value={upcomingSchedules.length} icon={Clock3} accent="amber" />
				<StatsCard
					label="Total Revenue"
					value={formatCurrency(summary.totalRevenue || 0)}
					icon={Wallet}
					accent="rose"
				/>
			</section>

			<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<div className="admin-surface p-4">
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Today's Bookings</p>
					<p className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
						<Ticket className="h-5 w-5 text-blue-600" />
						{loading ? "..." : liveMetrics.todayBookings}
					</p>
				</div>

				<div className="admin-surface p-4">
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Today's Revenue</p>
					<p className="mt-2 text-2xl font-bold text-slate-900">{loading ? "..." : formatCurrency(liveMetrics.todayRevenue)}</p>
				</div>

				<div className="admin-surface p-4">
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Pending Payments</p>
					<p className="mt-2 text-2xl font-bold text-slate-900">{loading ? "..." : liveMetrics.pendingPayments}</p>
				</div>

				<div className="admin-surface p-4">
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cancellation Rate</p>
					<p className="mt-2 text-2xl font-bold text-slate-900">{loading ? "..." : `${liveMetrics.cancellationRate.toFixed(1)}%`}</p>
					<p className="mt-1 text-xs text-slate-500">Avg ticket {formatCurrency(liveMetrics.averageTicket)}</p>
				</div>
			</section>

			<section className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
				<div className="admin-surface p-4">
					<div className="mb-3 flex items-center justify-between gap-2">
						<div>
							<h3 className="text-base font-bold text-slate-900">7-Day Booking Trend</h3>
							<p className="text-xs text-slate-500">Bookings volume and paid revenue over time.</p>
						</div>
					</div>

					<div className="h-72">
						{loading ? (
							<div className="h-full w-full rounded-xl bg-slate-50 p-3">
								<div className="skeleton h-full w-full" />
							</div>
						) : (
							<ResponsiveContainer width="100%" height="100%">
								<ComposedChart data={trendRows} margin={{ top: 10, right: 12, left: -16, bottom: 0 }}>
									<CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="4 4" />
									<XAxis dataKey="day" tickLine={false} axisLine={false} />
									<YAxis yAxisId="left" allowDecimals={false} tickLine={false} axisLine={false} width={34} />
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
				</div>

				<div className="admin-surface overflow-hidden">
					<div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
						<p className="text-sm font-semibold text-slate-900">Top Routes</p>
						<p className="text-xs text-slate-500">{routePerformance.length} routes</p>
					</div>

					<div className="divide-y divide-slate-100 bg-white">
						{loading ? (
							Array.from({ length: 5 }).map((_, index) => (
								<div key={`dashboard-route-skeleton-${index}`} className="px-4 py-3">
									<div className="skeleton h-4 w-2/3" />
									<div className="mt-2 skeleton h-3.5 w-1/2" />
								</div>
							))
						) : routePerformance.length === 0 ? (
							<div className="px-4 py-8 text-center text-sm text-slate-500">No route performance data yet.</div>
						) : (
							routePerformance.map((row) => (
								<div key={row.route} className="px-4 py-3">
									<p className="text-sm font-semibold text-slate-900">{row.route}</p>
									<div className="mt-1 flex items-center justify-between gap-2 text-xs text-slate-500">
										<span>{row.bookings} bookings • {row.seats} seats</span>
										<span className="font-semibold text-slate-700">{formatCurrency(row.revenue)}</span>
									</div>
								</div>
							))
						)}
					</div>
				</div>
			</section>

			{loading ? (
				<section className="grid gap-4 lg:grid-cols-2">
					<div className="admin-surface p-5">
						<div className="skeleton h-5 w-40" />
						<div className="mt-4 space-y-3">
							<div className="skeleton h-16 w-full" />
							<div className="skeleton h-16 w-full" />
							<div className="skeleton h-16 w-full" />
						</div>
					</div>
					<div className="admin-surface p-5">
						<div className="skeleton h-5 w-40" />
						<div className="mt-4 space-y-3">
							<div className="skeleton h-16 w-full" />
							<div className="skeleton h-16 w-full" />
							<div className="skeleton h-16 w-full" />
						</div>
					</div>
				</section>
			) : (
				<section className="grid gap-4 lg:grid-cols-2">
					<div className="admin-surface p-5">
						<div className="mb-3 flex items-center justify-between">
							<h3 className="text-lg font-bold text-slate-900">Upcoming Trips</h3>
							<Link to="/operator/schedules" className="text-sm font-semibold text-orange-600 hover:text-orange-700">
								Manage all
							</Link>
						</div>
						{upcomingSchedules.length === 0 ? (
							<div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
								No upcoming active schedules.
							</div>
						) : (
							<div className="space-y-3">
								{upcomingSchedules.map((schedule) => (
									<div key={schedule._id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
										<p className="text-sm font-semibold text-slate-900">{schedule?.route?.source || "Unknown"} {"->"} {schedule?.route?.destination || "Unknown"}</p>
										<p className="mt-1 text-xs text-slate-500">
											{formatDateLabel(schedule.date)} at {schedule.time} | Bus: {schedule?.bus?.name || "-"}
										</p>
										<div className="mt-2">
											<button
												type="button"
												onClick={() => navigate(`/operator/passengers/${schedule._id}`)}
												className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
											>
												Open passenger list
											</button>
										</div>
									</div>
								))}
							</div>
						)}
					</div>

					<div className="admin-surface p-5">
						<div className="mb-3 flex items-center justify-between">
							<h3 className="text-lg font-bold text-slate-900">Recent Bookings</h3>
							<Link to="/operator/bookings" className="text-sm font-semibold text-orange-600 hover:text-orange-700">
								View all
							</Link>
						</div>
						{recentBookings.length === 0 ? (
							<div className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
								No bookings yet.
							</div>
						) : (
							<div className="space-y-3">
								{recentBookings.map((booking) => (
									<div key={booking.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
										<div className="flex items-start justify-between gap-3">
											<div>
												<p className="text-sm font-semibold text-slate-900">{booking.passengerName}</p>
												<p className="mt-1 text-xs text-slate-500">
													{booking.route} | Seats: {Array.isArray(booking.seats) && booking.seats.length > 0 ? booking.seats.join(", ") : "-"}
												</p>
												<p className="mt-1 text-xs text-slate-500">Booked: {formatDateLabel(booking.bookedAt)}</p>
											</div>
											<div className="text-right">
												<p className="text-sm font-bold text-slate-900">{formatCurrency(booking.amount || 0)}</p>
												<p className="mt-1 text-xs text-slate-500">{String(booking.paymentStatus || "-")}</p>
											</div>
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				</section>
			)}

			{!loading && (summary?.totalBookings || 0) === 0 ? (
				<div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
					<p className="inline-flex items-center gap-2 font-semibold">
						<AlertCircle className="h-4 w-4" />
						No booking activity yet.
					</p>
					<p className="mt-1 text-xs">Activate schedules and publish fares to start receiving bookings.</p>
				</div>
			) : null}
		</div>
	);
}
