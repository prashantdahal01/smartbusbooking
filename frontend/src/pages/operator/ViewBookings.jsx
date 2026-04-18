import { Filter, RefreshCcw, Ticket, Wallet } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getOperatorBookings, getOperatorSchedules } from "../../services/operator.service";
import { formatCurrency } from "../../utils/helpers";

const routeLabel = (schedule) => {
	const source = String(schedule?.route || schedule?.route?.source || "Unknown").trim();
	const destination = String(schedule?.destination || schedule?.route?.destination || "").trim();
	if (destination) return `${source} -> ${destination}`;
	if (String(schedule?.route || "").includes("->")) return String(schedule.route);
	return source;
};

export default function ViewBookings() {
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [bookings, setBookings] = useState([]);
	const [summary, setSummary] = useState({ totalBookings: 0, totalRevenue: 0, paidCount: 0, cancelledCount: 0, byBus: [], byDay: [] });
	const [availableSchedules, setAvailableSchedules] = useState([]);

	const [scheduleFilter, setScheduleFilter] = useState("");
	const [dateFilter, setDateFilter] = useState("");

	const loadBookings = async ({ schedule = scheduleFilter, date = dateFilter } = {}) => {
		setLoading(true);
		setError("");

		try {
			const payload = await getOperatorBookings({ schedule, date });
			setBookings(Array.isArray(payload?.items) ? payload.items : []);
			setSummary(payload?.summary || { totalBookings: 0, totalRevenue: 0, paidCount: 0, cancelledCount: 0, byBus: [], byDay: [] });
			setAvailableSchedules(Array.isArray(payload?.availableSchedules) ? payload.availableSchedules : []);
		} catch (err) {
			setError(err?.response?.data?.message || err?.message || "Failed to load bookings");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		let cancelled = false;
		const preload = async () => {
			setLoading(true);
			setError("");
			try {
				const [schedules, payload] = await Promise.all([
					getOperatorSchedules(),
					getOperatorBookings(),
				]);

				if (cancelled) return;
				setAvailableSchedules(Array.isArray(payload?.availableSchedules) && payload.availableSchedules.length > 0
					? payload.availableSchedules
					: (Array.isArray(schedules) ? schedules.map((row) => ({
						id: String(row?._id || ""),
						date: row?.date,
						time: row?.time,
						route: `${row?.route?.source || "Unknown"} -> ${row?.route?.destination || "Unknown"}`,
						busName: row?.bus?.name || "",
						isActive: row?.isActive !== false,
					})) : []));
				setBookings(Array.isArray(payload?.items) ? payload.items : []);
				setSummary(payload?.summary || { totalBookings: 0, totalRevenue: 0, paidCount: 0, cancelledCount: 0, byBus: [], byDay: [] });
			} catch (err) {
				if (cancelled) return;
				setError(err?.response?.data?.message || err?.message || "Failed to load bookings");
			} finally {
				if (!cancelled) setLoading(false);
			}
		};

		preload();
		return () => {
			cancelled = true;
		};
	}, []);

	const rows = useMemo(() => bookings, [bookings]);

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 className="text-2xl font-bold text-slate-900">View Bookings</h2>
					<p className="text-sm text-slate-500">Track booked passengers, seat status, and earnings.</p>
				</div>

				<button
					type="button"
					onClick={() => loadBookings({ schedule: scheduleFilter, date: dateFilter })}
					className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
				>
					<RefreshCcw className="h-4 w-4" />
					Refresh
				</button>
			</div>

			<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				<div className="admin-surface p-4">
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Bookings</p>
					<p className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
						<Ticket className="h-5 w-5 text-orange-500" />
						{summary.totalBookings || 0}
					</p>
				</div>
				<div className="admin-surface p-4">
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Revenue</p>
					<p className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
						<Wallet className="h-5 w-5 text-emerald-500" />
						{formatCurrency(summary.totalRevenue || 0)}
					</p>
				</div>
				<div className="admin-surface p-4">
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paid/Confirmed</p>
					<p className="mt-2 text-2xl font-bold text-slate-900">{summary.paidCount || 0}</p>
				</div>
				<div className="admin-surface p-4">
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cancelled/Failed</p>
					<p className="mt-2 text-2xl font-bold text-slate-900">{summary.cancelledCount || 0}</p>
				</div>
			</section>

			<section className="admin-surface p-4">
				<div className="grid gap-3 md:grid-cols-[1.2fr_1fr_auto]">
					<div className="grid gap-2">
						<label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="booking-schedule">Schedule</label>
						<select
							id="booking-schedule"
							value={scheduleFilter}
							onChange={(event) => setScheduleFilter(event.target.value)}
							className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-orange-200 focus:ring-2 focus:ring-orange-100"
						>
							<option value="">All schedules</option>
							{availableSchedules.map((schedule) => (
								<option key={schedule.id} value={schedule.id}>
									{schedule.date} {schedule.time} | {schedule.route}
								</option>
							))}
						</select>
					</div>

					<div className="grid gap-2">
						<label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="booking-date">Date</label>
						<input
							id="booking-date"
							type="date"
							value={dateFilter}
							onChange={(event) => setDateFilter(event.target.value)}
							className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-orange-200 focus:ring-2 focus:ring-orange-100"
						/>
					</div>

					<button
						type="button"
						onClick={() => loadBookings({ schedule: scheduleFilter, date: dateFilter })}
						className="inline-flex h-11 items-center justify-center gap-2 self-end rounded-xl bg-orange-500 px-4 text-sm font-semibold text-white transition hover:bg-orange-600"
					>
						<Filter className="h-4 w-4" />
						Apply Filters
					</button>
				</div>
			</section>

			{error ? (
				<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
					{error}
				</div>
			) : null}

			<section className="admin-surface overflow-hidden">
				<div className="overflow-x-auto">
					<table className="min-w-full divide-y divide-slate-200 text-sm">
						<thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
							<tr>
								<th className="px-4 py-3 font-semibold">Passenger</th>
								<th className="px-4 py-3 font-semibold">Route / Bus</th>
								<th className="px-4 py-3 font-semibold">Seats</th>
								<th className="px-4 py-3 font-semibold">Boarding to Drop</th>
								<th className="px-4 py-3 font-semibold">Status</th>
								<th className="px-4 py-3 font-semibold">Amount</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-slate-100 bg-white">
							{loading ? (
								<tr>
									<td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">Loading bookings...</td>
								</tr>
							) : rows.length === 0 ? (
								<tr>
									<td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">No bookings found for selected filters.</td>
								</tr>
							) : (
								rows.map((row) => (
									<tr key={row.id} className="hover:bg-slate-50/70">
										<td className="px-4 py-3 align-top">
											<p className="font-semibold text-slate-900">{row.passengerName}</p>
											<p className="mt-1 text-xs text-slate-500">{row.phone || "-"}</p>
										</td>
										<td className="px-4 py-3 align-top">
											<p className="font-semibold text-slate-900">{row.route}</p>
											<p className="mt-1 text-xs text-slate-500">{row.busName} | {row.scheduleDate} {row.scheduleTime}</p>
										</td>
										<td className="px-4 py-3 align-top text-slate-700">
											{Array.isArray(row.seats) && row.seats.length > 0 ? row.seats.join(", ") : "-"}
										</td>
										<td className="px-4 py-3 align-top text-slate-700">
											{row.boardingPoint || "-"} {"->"} {row.droppingPoint || "-"}
										</td>
										<td className="px-4 py-3 align-top">
											<span className={`rounded-full px-2 py-1 text-xs font-semibold ${
												row.status === "cancelled" || row.status === "payment_failed"
													? "bg-rose-100 text-rose-700"
													: "bg-emerald-100 text-emerald-700"
											}`}>
												{row.status}
											</span>
											<p className="mt-1 text-xs text-slate-500">Payment: {row.paymentStatus || "-"}</p>
										</td>
										<td className="px-4 py-3 align-top font-semibold text-slate-900">
											{formatCurrency(row.amount || 0)}
										</td>
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
