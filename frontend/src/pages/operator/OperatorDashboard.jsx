import { BusFront, CalendarDays, Ticket, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import StatsCard from "../../components/operator/StatsCard";
import { getOperatorDashboardData } from "../../services/operator.service";
import { formatCurrency } from "../../utils/helpers";

const toDateTimeMs = (date, time) => {
	const dateText = String(date || "").trim();
	const timeText = String(time || "00:00").trim() || "00:00";
	if (!dateText) return NaN;
	return new Date(`${dateText}T${timeText}:00`).getTime();
};

export default function OperatorDashboard() {
	const [loading, setLoading] = useState(true);
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

	useEffect(() => {
		let cancelled = false;

		const load = async () => {
			setLoading(true);
			setError("");

			try {
				const data = await getOperatorDashboardData();
				if (cancelled) return;

				setBuses(data.buses);
				setSchedules(data.schedules);
				setBookings(data.bookings);
				setSummary(data.bookingSummary);
			} catch (err) {
				if (cancelled) return;
				setError(err?.response?.data?.message || err?.message || "Failed to load operator dashboard");
			} finally {
				if (!cancelled) setLoading(false);
			}
		};

		load();
		return () => {
			cancelled = true;
		};
	}, []);

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

	const recentBookings = useMemo(() => bookings.slice(0, 6), [bookings]);

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 className="text-2xl font-bold text-slate-900">Operator Dashboard</h2>
					<p className="text-sm text-slate-500">
						Monitor your buses, trips, bookings, and revenue in one place.
					</p>
				</div>
				<div className="inline-flex rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600">
					{new Date().toLocaleDateString()}
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
				<StatsCard label="Total Bookings" value={summary.totalBookings || 0} icon={Ticket} accent="amber" />
				<StatsCard
					label="Total Revenue"
					value={formatCurrency(summary.totalRevenue || 0)}
					icon={Wallet}
					accent="rose"
				/>
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
								Manage
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
										<p className="text-sm font-semibold text-slate-900">
											{schedule?.route?.source || "Unknown"} {"->"} {schedule?.route?.destination || "Unknown"}
										</p>
										<p className="mt-1 text-xs text-slate-500">
											{schedule.date} at {schedule.time} | Bus: {schedule?.bus?.name || "-"}
										</p>
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
											</div>
											<p className="text-sm font-bold text-slate-900">{formatCurrency(booking.amount || 0)}</p>
										</div>
									</div>
								))}
							</div>
						)}
					</div>
				</section>
			)}
		</div>
	);
}
