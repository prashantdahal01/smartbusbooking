import {
	AlertCircle,
	CalendarDays,
	Download,
	Phone,
	RefreshCcw,
	Search,
	Ticket,
	Users,
	Wallet,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getOperatorBookings, getOperatorSeatStatus } from "../../services/operator.service";
import { formatCurrency } from "../../utils/helpers";

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

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

const isRevenueBooking = (booking) => {
	const status = String(booking?.status || "").trim().toLowerCase();
	const paymentStatus = String(booking?.paymentStatus || "").trim().toLowerCase();
	return status === "confirmed" && paymentStatus === "paid";
};

const toPassengerCount = (booking) => {
	const explicit = Number(booking?.passengerCount);
	if (Number.isFinite(explicit) && explicit > 0) return explicit;

	if (Array.isArray(booking?.passengerNames) && booking.passengerNames.length > 0) {
		return booking.passengerNames.length;
	}

	if (Array.isArray(booking?.seats) && booking.seats.length > 0) {
		return booking.seats.length;
	}

	return 1;
};

const downloadCsv = (filename, rows) => {
	const safeName = String(filename || "passengers.csv").replace(/[^\w.-]+/g, "_");
	const csv = [
		[
			"Booking ID",
			"Passenger",
			"Passengers",
			"Seats",
			"Phone",
			"Status",
			"Payment",
			"Boarding",
			"Dropping",
			"Booked At",
			"Amount",
		].join(","),
		...rows.map((item) => [
			item.id,
			item.passengerName,
			Array.isArray(item.passengerNames) ? item.passengerNames.join(" | ") : item.passengerName,
			Array.isArray(item.seats) ? item.seats.join(" ") : "",
			item.phone,
			item.status,
			item.paymentStatus,
			item.boardingPoint,
			item.droppingPoint,
			item.bookedAt,
			item.amount,
		].map((cell) => `"${String(cell ?? "").replaceAll('"', '""')}"`).join(",")),
	].join("\n");

	const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.setAttribute("download", safeName);
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
};

export default function PassengerList() {
	const { scheduleId } = useParams();

	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState("");

	const [bookings, setBookings] = useState([]);
	const [scheduleMeta, setScheduleMeta] = useState(null);

	const [seatSnapshot, setSeatSnapshot] = useState(null);
	const [seatError, setSeatError] = useState("");

	const [query, setQuery] = useState("");
	const [statusFilter, setStatusFilter] = useState("all");
	const [paymentFilter, setPaymentFilter] = useState("all");

	const loadData = useCallback(async ({ silent = false } = {}) => {
		if (!silent) setLoading(true);
		setError("");
		setSeatError("");

		try {
			const [bookingResult, seatResult] = await Promise.allSettled([
				getOperatorBookings({ schedule: scheduleId }),
				getOperatorSeatStatus(scheduleId),
			]);

			if (bookingResult.status === "rejected") {
				throw bookingResult.reason;
			}

			const payload = bookingResult.value;
			const rows = Array.isArray(payload?.items) ? payload.items : [];
			setBookings(rows);

			const availableSchedules = Array.isArray(payload?.availableSchedules)
				? payload.availableSchedules
				: [];
			const fromAvailable = availableSchedules.find((item) => item?.id === scheduleId) || null;
			const fallback = rows[0]
				? {
					id: rows[0].scheduleId,
					route: rows[0].route,
					busName: rows[0].busName,
					date: rows[0].scheduleDate,
					time: rows[0].scheduleTime,
					isActive: true,
				}
				: null;
			setScheduleMeta(fromAvailable || fallback);

			if (seatResult.status === "fulfilled") {
				const totalSeats = Number.isFinite(Number(seatResult.value?.totalSeats))
					? Number(seatResult.value.totalSeats)
					: 0;
				const bookedSeats = Array.isArray(seatResult.value?.bookedSeats)
					? seatResult.value.bookedSeats.length
					: 0;

				setSeatSnapshot({
					totalSeats,
					bookedSeats,
					availableSeats: Math.max(0, totalSeats - bookedSeats),
				});
			} else {
				setSeatSnapshot(null);
				setSeatError(
					seatResult.reason?.response?.data?.message
						|| seatResult.reason?.message
						|| "Seat snapshot is unavailable for this schedule"
				);
			}
		} catch (err) {
			setError(err?.response?.data?.message || err?.message || "Failed to load passenger list");
		} finally {
			if (!silent) setLoading(false);
		}
	}, [scheduleId]);

	useEffect(() => {
		loadData();
	}, [loadData]);

	const filteredBookings = useMemo(() => {
		const q = String(query || "").trim().toLowerCase();
		const statusToken = String(statusFilter || "all").trim().toLowerCase();
		const paymentToken = String(paymentFilter || "all").trim().toLowerCase();

		return bookings
			.filter((booking) => {
				if (statusToken !== "all") {
					if (String(booking?.status || "").trim().toLowerCase() !== statusToken) return false;
				}

				if (paymentToken !== "all") {
					if (String(booking?.paymentStatus || "").trim().toLowerCase() !== paymentToken) return false;
				}

				if (!q) return true;
				const haystack = [
					booking?.passengerName,
					Array.isArray(booking?.passengerNames) ? booking.passengerNames.join(" ") : "",
					Array.isArray(booking?.seats) ? booking.seats.join(" ") : "",
					booking?.phone,
					booking?.boardingPoint,
					booking?.droppingPoint,
				].join(" ").toLowerCase();

				return haystack.includes(q);
			})
			.sort((a, b) => new Date(b?.bookedAt || 0).getTime() - new Date(a?.bookedAt || 0).getTime());
	}, [bookings, paymentFilter, query, statusFilter]);

	const metrics = useMemo(() => {
		const totalBookings = bookings.length;
		const totalPassengers = bookings.reduce((sum, booking) => sum + toPassengerCount(booking), 0);
		const confirmedPassengers = bookings.reduce((sum, booking) => {
			if (String(booking?.status || "").trim().toLowerCase() !== "confirmed") return sum;
			return sum + toPassengerCount(booking);
		}, 0);

		const paidRevenue = bookings.reduce((sum, booking) => {
			if (!isRevenueBooking(booking)) return sum;
			return sum + (Number(booking?.amount) || 0);
		}, 0);

		const pendingPayments = bookings.filter((booking) => String(booking?.paymentStatus || "").trim().toLowerCase() === "pending").length;

		return {
			totalBookings,
			totalPassengers,
			confirmedPassengers,
			paidRevenue,
			pendingPayments,
		};
	}, [bookings]);

	const refresh = async () => {
		setRefreshing(true);
		await loadData({ silent: true });
		setRefreshing(false);
	};

	const scheduleTitle = String(scheduleMeta?.route || bookings?.[0]?.route || "Schedule Passenger List");
	const scheduleBus = String(scheduleMeta?.busName || bookings?.[0]?.busName || "-");
	const scheduleDate = scheduleMeta?.date || bookings?.[0]?.scheduleDate;
	const scheduleTime = scheduleMeta?.time || bookings?.[0]?.scheduleTime;

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 className="text-2xl font-bold text-slate-900">Passenger List</h2>
					<p className="text-sm text-slate-500">Live passenger and booking visibility for this schedule.</p>
				</div>

				<div className="flex flex-wrap items-center gap-2">
					<Link
						to="/operator/bookings"
						className="inline-flex h-10 items-center rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
					>
						Back to Bookings
					</Link>
					<button
						type="button"
						onClick={refresh}
						className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
					>
						<RefreshCcw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
						Refresh
					</button>
					<button
						type="button"
						onClick={() => downloadCsv(`passengers-${scheduleId}.csv`, filteredBookings)}
						disabled={!filteredBookings.length}
						className="inline-flex h-10 items-center gap-2 rounded-xl bg-orange-500 px-3 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
					>
						<Download className="h-4 w-4" />
						Export
					</button>
				</div>
			</div>

			<div className="admin-surface p-5">
				<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Schedule</p>
				<h3 className="mt-1 text-xl font-extrabold text-slate-900">{scheduleTitle}</h3>
				<p className="mt-1 text-sm text-slate-500">
					{scheduleBus} • {formatDateLabel(scheduleDate)} at {scheduleTime || "--:--"}
				</p>
				{scheduleMeta?.isActive === false ? (
					<p className="mt-2 inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
						Inactive schedule
					</p>
				) : null}
			</div>

			{error ? (
				<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
			) : null}

			<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
				<div className="admin-surface p-4">
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bookings</p>
					<p className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
						<Ticket className="h-5 w-5 text-blue-600" />
						{loading ? "..." : metrics.totalBookings}
					</p>
				</div>

				<div className="admin-surface p-4">
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Passengers</p>
					<p className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
						<Users className="h-5 w-5 text-orange-600" />
						{loading ? "..." : metrics.totalPassengers}
					</p>
				</div>

				<div className="admin-surface p-4">
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Confirmed Pax</p>
					<p className="mt-2 text-2xl font-bold text-slate-900">{loading ? "..." : metrics.confirmedPassengers}</p>
				</div>

				<div className="admin-surface p-4">
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paid Revenue</p>
					<p className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
						<Wallet className="h-5 w-5 text-emerald-600" />
						{loading ? "..." : formatCurrency(metrics.paidRevenue)}
					</p>
				</div>

				<div className="admin-surface p-4">
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Seat Snapshot</p>
					{loading ? (
						<p className="mt-2 text-2xl font-bold text-slate-900">...</p>
					) : seatSnapshot ? (
						<>
							<p className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
								<CalendarDays className="h-5 w-5 text-indigo-600" />
								{seatSnapshot.bookedSeats}/{seatSnapshot.totalSeats}
							</p>
							<p className="mt-1 text-xs text-slate-500">{seatSnapshot.availableSeats} seats available</p>
						</>
					) : (
						<p className="mt-2 text-sm font-semibold text-slate-700">Unavailable</p>
					)}
				</div>
			</section>

			{seatError ? (
				<div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
					<p className="inline-flex items-center gap-2 font-semibold">
						<AlertCircle className="h-4 w-4" />
						Seat status note
					</p>
					<p className="mt-1 text-xs">{seatError}</p>
				</div>
			) : null}

			<section className="admin-surface p-4">
				<div className="grid gap-3 md:grid-cols-3">
					<label className="grid gap-1 text-sm md:col-span-2">
						<span className="font-semibold text-slate-700">Search Passenger / Seat / Point</span>
						<div className="flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
							<Search className="h-4 w-4 text-slate-400" />
							<input
								value={query}
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Passenger name, seat, phone, boarding"
								className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
							/>
						</div>
					</label>

					<label className="grid gap-1 text-sm">
						<span className="font-semibold text-slate-700">Status</span>
						<select
							value={statusFilter}
							onChange={(event) => setStatusFilter(event.target.value)}
							className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-orange-200 focus:ring-2 focus:ring-orange-100"
						>
							<option value="all">All</option>
							<option value="confirmed">Confirmed</option>
							<option value="pending">Pending</option>
							<option value="cancelled">Cancelled</option>
						</select>
					</label>
				</div>

				<div className="mt-3 grid gap-3 md:grid-cols-[1fr_auto]">
					<label className="grid gap-1 text-sm md:max-w-xs">
						<span className="font-semibold text-slate-700">Payment</span>
						<select
							value={paymentFilter}
							onChange={(event) => setPaymentFilter(event.target.value)}
							className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-orange-200 focus:ring-2 focus:ring-orange-100"
						>
							<option value="all">All</option>
							<option value="paid">Paid</option>
							<option value="pending">Pending</option>
							<option value="failed">Failed</option>
						</select>
					</label>

					<div className="inline-flex items-end text-xs font-semibold text-slate-500">
						{metrics.pendingPayments} bookings pending payment
					</div>
				</div>
			</section>

			<section className="admin-surface overflow-hidden">
				<div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
					<p className="text-sm font-semibold text-slate-900">Passenger Records</p>
					<p className="text-xs text-slate-500">{filteredBookings.length} rows</p>
				</div>

				<div className="overflow-x-auto">
					<table className="min-w-full divide-y divide-slate-200 text-sm">
						<thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
							<tr>
								<th className="px-4 py-3 font-semibold">Passenger</th>
								<th className="px-4 py-3 font-semibold">Seats</th>
								<th className="px-4 py-3 font-semibold">Contact</th>
								<th className="px-4 py-3 font-semibold">Status</th>
								<th className="px-4 py-3 font-semibold">Payment</th>
								<th className="px-4 py-3 font-semibold">Boarding → Dropping</th>
								<th className="px-4 py-3 font-semibold">Booked At</th>
								<th className="px-4 py-3 font-semibold text-right">Amount</th>
							</tr>
						</thead>

						<tbody className="divide-y divide-slate-100 bg-white">
							{loading ? (
								<tr>
									<td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-500">Loading passengers...</td>
								</tr>
							) : filteredBookings.length === 0 ? (
								<tr>
									<td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">No passenger records found for this schedule.</td>
								</tr>
							) : (
								filteredBookings.map((booking) => (
									<tr key={booking.id} className="hover:bg-slate-50/70">
										<td className="px-4 py-3 align-top">
											<p className="font-semibold text-slate-900">{booking.passengerName || "Unknown"}</p>
											<p className="mt-1 text-xs text-slate-500">
												{toPassengerCount(booking)} passenger(s)
											</p>
										</td>

										<td className="px-4 py-3 align-top text-slate-700">
											{Array.isArray(booking?.seats) && booking.seats.length > 0 ? booking.seats.join(", ") : "-"}
										</td>

										<td className="px-4 py-3 align-top text-slate-700">
											<span className="inline-flex items-center gap-2">
												<Phone className="h-3.5 w-3.5 text-slate-400" />
												{booking?.phone || "-"}
											</span>
										</td>

										<td className="px-4 py-3 align-top">
											<span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
												{String(booking?.status || "-")}
											</span>
										</td>

										<td className="px-4 py-3 align-top">
											<span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
												{String(booking?.paymentStatus || "-")}
											</span>
										</td>

										<td className="px-4 py-3 align-top text-slate-700">
											<p>{booking?.boardingPoint || "-"}</p>
											<p className="text-xs text-slate-500">to {booking?.droppingPoint || "-"}</p>
										</td>

										<td className="px-4 py-3 align-top text-slate-700">{formatDateLabel(booking?.bookedAt)}</td>

										<td className="px-4 py-3 align-top text-right font-semibold text-slate-900">
											{formatCurrency(booking?.amount || 0)}
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
