import { CalendarDays, Eye, Pencil, Plus, ToggleLeft, ToggleRight, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import ScheduleForm from "../../components/operator/ScheduleForm";
import {
	createOperatorSchedule,
	deleteOperatorSchedule,
	getOperatorBookings,
	getOperatorSchedules,
	getOperatorSeatStatus,
	getOperatorBuses,
	getRouteCatalog,
	updateOperatorSchedule,
} from "../../services/operator.service";
import { formatCurrency } from "../../utils/helpers";

const routeLabel = (route) => {
	const source = String(route?.source || route?.sourceCity?.name || "Unknown").trim();
	const destination = String(route?.destination || route?.destinationCity?.name || "Unknown").trim();
	return `${source} -> ${destination}`;
};

const toDateTimeMs = (date, time) => {
	if (!date) return NaN;
	return new Date(`${date}T${String(time || "00:00").trim() || "00:00"}:00`).getTime();
};

const normalizeSeatLabel = (value) => String(value || "").trim().toUpperCase().replace(/\s+/g, "");

const extractSeatLabelsFromLayout = (seatLayout, totalSeats) => {
	const labels = [];
	const seen = new Set();

	(Array.isArray(seatLayout) ? seatLayout : []).forEach((deck) => {
		(Array.isArray(deck?.seats) ? deck.seats : []).forEach((seat) => {
			const label = normalizeSeatLabel(seat?.seatLabel || seat?.seatNumber);
			if (!label || seen.has(label)) return;
			seen.add(label);
			labels.push(label);
		});
	});

	if (labels.length > 0) {
		return labels.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
	}

	const safeTotal = Number.isFinite(Number(totalSeats)) && Number(totalSeats) > 0 ? Math.trunc(Number(totalSeats)) : 0;
	return Array.from({ length: safeTotal }, (_, idx) => String(idx + 1));
};

export default function ManageSchedules() {
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");

	const [buses, setBuses] = useState([]);
	const [routes, setRoutes] = useState([]);
	const [schedules, setSchedules] = useState([]);
	const [search, setSearch] = useState("");

	const [formOpen, setFormOpen] = useState(false);
	const [formMode, setFormMode] = useState("create");
	const [editingSchedule, setEditingSchedule] = useState(null);

	const [seatDialog, setSeatDialog] = useState({
		open: false,
		loading: false,
		title: "",
		data: null,
		bookings: [],
		error: "",
	});

	const loadAll = async () => {
		setLoading(true);
		setError("");

		try {
			const [scheduleRows, busRows, routeRows] = await Promise.all([
				getOperatorSchedules(),
				getOperatorBuses(),
				getRouteCatalog(),
			]);

			setSchedules(Array.isArray(scheduleRows) ? scheduleRows : []);
			setBuses(Array.isArray(busRows) ? busRows : []);
			setRoutes(Array.isArray(routeRows) ? routeRows : []);
		} catch (err) {
			setError(err?.response?.data?.message || err?.message || "Failed to load schedules");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadAll();
	}, []);

	useEffect(() => {
		if (!notice) return undefined;
		const timer = setTimeout(() => setNotice(""), 2600);
		return () => clearTimeout(timer);
	}, [notice]);

	const rows = useMemo(() => {
		const keyword = String(search || "").trim().toLowerCase();
		if (!keyword) {
			return [...schedules].sort((a, b) => {
				const diff = toDateTimeMs(a?.date, a?.time) - toDateTimeMs(b?.date, b?.time);
				return Number.isFinite(diff) ? diff : 0;
			});
		}

		return schedules.filter((schedule) => {
			const haystack = `${schedule?.bus?.name || ""} ${routeLabel(schedule?.route)} ${schedule?.date || ""}`.toLowerCase();
			return haystack.includes(keyword);
		});
	}, [schedules, search]);

	const openCreate = () => {
		setFormMode("create");
		setEditingSchedule(null);
		setFormOpen(true);
	};

	const openEdit = (schedule) => {
		setFormMode("edit");
		setEditingSchedule(schedule);
		setFormOpen(true);
	};

	const submitSchedule = async (payload) => {
		setSubmitting(true);
		setError("");
		try {
			if (formMode === "edit" && editingSchedule?._id) {
				await updateOperatorSchedule(editingSchedule._id, payload);
				setNotice("Schedule updated successfully");
			} else {
				await createOperatorSchedule(payload);
				setNotice("Schedule created successfully");
			}

			setFormOpen(false);
			setEditingSchedule(null);
			await loadAll();
		} finally {
			setSubmitting(false);
		}
	};

	const removeSchedule = async (schedule) => {
		const confirmed = window.confirm("Delete this schedule? Existing active bookings will block deletion.");
		if (!confirmed) return;

		setSubmitting(true);
		setError("");
		try {
			await deleteOperatorSchedule(schedule._id);
			setNotice("Schedule deleted");
			await loadAll();
		} catch (err) {
			setError(err?.response?.data?.message || err?.message || "Failed to delete schedule");
		} finally {
			setSubmitting(false);
		}
	};

	const toggleScheduleStatus = async (schedule) => {
		setSubmitting(true);
		setError("");
		try {
			await updateOperatorSchedule(schedule._id, { isActive: !(schedule?.isActive !== false) });
			setNotice(schedule?.isActive !== false ? "Schedule marked inactive" : "Schedule activated");
			await loadAll();
		} catch (err) {
			setError(err?.response?.data?.message || err?.message || "Failed to update schedule status");
		} finally {
			setSubmitting(false);
		}
	};

	const openSeatSnapshot = async (schedule) => {
		setSeatDialog({
			open: true,
			loading: true,
			title: `${routeLabel(schedule?.route)} (${schedule?.date} ${schedule?.time})`,
			data: null,
			bookings: [],
			error: "",
		});

		try {
			const [seatData, bookingPayload] = await Promise.all([
				getOperatorSeatStatus(schedule._id),
				getOperatorBookings({ schedule: schedule._id }),
			]);

			const seatLabels = extractSeatLabelsFromLayout(seatData?.seatLayout, seatData?.totalSeats);
			const bookedSeats = [...new Set(
				(Array.isArray(seatData?.bookedSeats) ? seatData.bookedSeats : [])
					.map((seat) => normalizeSeatLabel(seat))
					.filter(Boolean)
			)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));

			const totalSeats = Number.isFinite(Number(seatData?.totalSeats))
				? Number(seatData.totalSeats)
				: seatLabels.length;
			const bookedCount = bookedSeats.length;
			const availableCount = Math.max(0, totalSeats - bookedCount);

			setSeatDialog((prev) => ({
				...prev,
				loading: false,
				data: {
					...seatData,
					seatLabels,
					totalSeats,
					bookedSeats,
					bookedCount,
					availableCount,
				},
				bookings: Array.isArray(bookingPayload?.items) ? bookingPayload.items : [],
			}));
		} catch (err) {
			setSeatDialog((prev) => ({
				...prev,
				loading: false,
				error: err?.response?.data?.message || err?.message || "Failed to load seat status",
			}));
		}
	};

	return (
		<div className="space-y-5">
			{notice ? (
				<div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
					{notice}
				</div>
			) : null}

			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 className="text-2xl font-bold text-slate-900">Manage Schedules</h2>
					<p className="text-sm text-slate-500">Create, update, and control trip availability for your buses.</p>
				</div>

				<button
					type="button"
					onClick={openCreate}
					className="inline-flex h-10 items-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-semibold text-white transition hover:bg-orange-600"
				>
					<Plus className="h-4 w-4" />
					Add Schedule
				</button>
			</div>

			<section className="admin-surface p-4">
				<input
					value={search}
					onChange={(event) => setSearch(event.target.value)}
					placeholder="Search by route, bus, or date"
					className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-orange-200 focus:ring-2 focus:ring-orange-100"
				/>
			</section>

			{error ? (
				<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
					{error}
				</div>
			) : null}

			{loading ? (
				<div className="grid gap-4">
					{Array.from({ length: 5 }).map((_, index) => (
						<div key={`schedule-skeleton-${index}`} className="admin-surface p-4">
							<div className="skeleton h-5 w-1/3" />
							<div className="mt-3 space-y-2">
								<div className="skeleton h-4 w-2/3" />
								<div className="skeleton h-4 w-1/2" />
							</div>
						</div>
					))}
				</div>
			) : rows.length === 0 ? (
				<div className="admin-surface grid place-items-center p-10 text-center">
					<div className="grid h-14 w-14 place-items-center rounded-full bg-slate-100 text-slate-500">
						<CalendarDays className="h-7 w-7" />
					</div>
					<h3 className="mt-4 text-lg font-semibold text-slate-900">No schedules found</h3>
					<p className="mt-1 text-sm text-slate-500">Create a schedule to start taking bookings for your routes.</p>
				</div>
			) : (
				<div className="space-y-3">
					{rows.map((schedule) => (
						<article key={schedule._id} className="admin-surface admin-surface-hover p-4">
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div>
									<h3 className="text-base font-bold text-slate-900">{routeLabel(schedule?.route)}</h3>
									<p className="mt-1 text-xs text-slate-500">
										Bus: {schedule?.bus?.name || "-"} | {schedule.date} {schedule.time} {"->"} {schedule.arrivalDate || schedule.date} {schedule.arrivalTime || "-"}
									</p>
									<p className="mt-1 text-xs text-slate-500">Fare: {formatCurrency(schedule?.price || 0)}</p>
								</div>

								<span className={`rounded-full px-2 py-1 text-xs font-semibold ${
									schedule?.isActive !== false
										? "bg-emerald-100 text-emerald-700"
										: "bg-slate-200 text-slate-700"
								}`}>
									{schedule?.isActive !== false ? "Active" : "Inactive"}
								</span>
							</div>

							<div className="mt-4 flex flex-wrap gap-2">
								<button
									type="button"
									onClick={() => openEdit(schedule)}
									className="inline-flex h-9 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
								>
									<Pencil className="h-4 w-4" />
									Edit
								</button>

								<button
									type="button"
									onClick={() => toggleScheduleStatus(schedule)}
									disabled={submitting}
									className="inline-flex h-9 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-700 transition hover:bg-amber-100 disabled:opacity-60"
								>
									{schedule?.isActive !== false ? <ToggleLeft className="h-4 w-4" /> : <ToggleRight className="h-4 w-4" />}
									{schedule?.isActive !== false ? "Deactivate" : "Activate"}
								</button>

								<button
									type="button"
									onClick={() => openSeatSnapshot(schedule)}
									className="inline-flex h-9 items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-3 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
								>
									<Eye className="h-4 w-4" />
									Schedule Insight
								</button>

								<button
									type="button"
									onClick={() => removeSchedule(schedule)}
									disabled={submitting}
									className="inline-flex h-9 items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 text-sm font-semibold text-rose-700 transition hover:bg-rose-100 disabled:opacity-60"
								>
									<Trash2 className="h-4 w-4" />
									Delete
								</button>
							</div>
						</article>
					))}
				</div>
			)}

			<ScheduleForm
				open={formOpen}
				mode={formMode}
				initialValues={editingSchedule}
				buses={buses}
				routes={routes}
				onSubmit={submitSchedule}
				onClose={() => {
					setFormOpen(false);
					setEditingSchedule(null);
				}}
				loading={submitting}
			/>

			{seatDialog.open ? (
				<div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 px-3">
					<div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
						<div className="mb-3 flex items-start justify-between gap-3">
							<div>
								<h3 className="text-lg font-bold text-slate-900">Schedule Insight (Read-only)</h3>
								<p className="text-xs text-slate-500">{seatDialog.title}</p>
							</div>
							<button
								type="button"
								onClick={() => setSeatDialog({ open: false, loading: false, title: "", data: null, bookings: [], error: "" })}
								className="rounded-lg px-3 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100"
							>
								Close
							</button>
						</div>

						{seatDialog.loading ? (
							<div className="space-y-2">
								<div className="skeleton h-4 w-2/3" />
								<div className="skeleton h-4 w-1/2" />
								<div className="skeleton h-4 w-3/4" />
							</div>
						) : seatDialog.error ? (
							<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
								{seatDialog.error}
							</div>
						) : (
							<div className="space-y-4">
								<div className="grid gap-3 sm:grid-cols-3">
									<div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
										<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total seats</p>
										<p className="mt-1 text-xl font-bold text-slate-900">{seatDialog?.data?.totalSeats || 0}</p>
									</div>
									<div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm">
										<p className="text-xs font-semibold uppercase tracking-wide text-rose-600">Booked</p>
										<p className="mt-1 text-xl font-bold text-rose-700">{seatDialog?.data?.bookedCount || 0}</p>
									</div>
									<div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
										<p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Available</p>
										<p className="mt-1 text-xl font-bold text-emerald-700">{seatDialog?.data?.availableCount || 0}</p>
									</div>
								</div>

								<div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
									<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Seat visibility (read-only)</p>
									<div className="mt-2 max-h-42 overflow-auto">
										<div className="flex flex-wrap gap-2">
											{(seatDialog?.data?.seatLabels || []).map((seatLabel) => {
												const isBooked = (seatDialog?.data?.bookedSeats || []).includes(seatLabel);
												return (
													<span
														key={`insight-seat-${seatLabel}`}
														className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
															isBooked
																? "bg-rose-100 text-rose-700"
																: "bg-emerald-100 text-emerald-700"
														}`}
													>
														{seatLabel} {isBooked ? "(Booked)" : "(Available)"}
													</span>
												);
											})}
										</div>
									</div>
								</div>

								<div className="rounded-xl border border-slate-200 bg-white p-3">
									<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Booking details</p>
									{seatDialog.bookings.length === 0 ? (
										<p className="mt-2 text-sm text-slate-500">No bookings for this schedule yet.</p>
									) : (
										<div className="mt-2 overflow-x-auto">
											<table className="min-w-full text-left text-xs">
												<thead className="text-slate-500">
													<tr>
														<th className="py-2 pr-3 font-semibold">Passenger</th>
														<th className="py-2 pr-3 font-semibold">Seat numbers</th>
														<th className="py-2 pr-3 font-semibold">Boarding</th>
														<th className="py-2 pr-3 font-semibold">Dropping</th>
														<th className="py-2 font-semibold">Payment status</th>
													</tr>
												</thead>
												<tbody>
													{seatDialog.bookings.map((booking) => (
														<tr key={booking.id} className="border-t border-slate-100">
															<td className="py-2 pr-3 text-slate-700">{booking.passengerName || "-"}</td>
															<td className="py-2 pr-3 text-slate-700">{Array.isArray(booking.seats) ? booking.seats.join(", ") : "-"}</td>
															<td className="py-2 pr-3 text-slate-700">{booking.boardingPoint || "-"}</td>
															<td className="py-2 pr-3 text-slate-700">{booking.droppingPoint || "-"}</td>
															<td className="py-2 text-slate-700">{booking.paymentStatus || "-"}</td>
														</tr>
													))}
												</tbody>
											</table>
										</div>
									)}
								</div>
							</div>
						)}
					</div>
				</div>
			) : null}
		</div>
	);
}
