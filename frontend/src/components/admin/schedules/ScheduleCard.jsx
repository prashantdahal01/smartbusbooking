import { BadgeDollarSign, BusFront, Clock3, Eye, Pencil, Trash2, Users } from "lucide-react";

const TIME_RE = /^\d{2}:\d{2}$/;

const formatTime = (value) => {
	const raw = String(value || "").trim();
	if (!TIME_RE.test(raw)) return raw || "-";
	const [hRaw, mRaw] = raw.split(":");
	const hours = Number(hRaw);
	const minutes = Number(mRaw);
	if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return raw;
	const suffix = hours >= 12 ? "PM" : "AM";
	const twelveHour = hours % 12 === 0 ? 12 : hours % 12;
	return `${twelveHour}:${String(minutes).padStart(2, "0")} ${suffix}`;
};

const inferSeatCapacityFromBus = (bus) => {
	const seatCountFromDecks = (Array.isArray(bus?.decks) ? bus.decks : []).reduce((total, deck) => {
		const deckCount = Array.isArray(deck?.seats) ? deck.seats.length : 0;
		return total + deckCount;
	}, 0);
	if (seatCountFromDecks > 0) return seatCountFromDecks;

	const totalSeats = Number(bus?.totalSeats);
	if (Number.isFinite(totalSeats) && totalSeats > 0) return Math.trunc(totalSeats);

	return 0;
};

const normalizeSeatMetrics = ({ seatMetrics, schedule }) => {
	const fallbackTotal = inferSeatCapacityFromBus(schedule?.bus);

	const totalFromMetrics = Number(seatMetrics?.totalSeats);
	const totalSeats = Number.isFinite(totalFromMetrics) && totalFromMetrics > 0 ? Math.trunc(totalFromMetrics) : fallbackTotal;

	const bookedFromMetrics = Number(seatMetrics?.bookedSeats);
	const bookedSeats = Number.isFinite(bookedFromMetrics) && bookedFromMetrics >= 0 ? Math.trunc(bookedFromMetrics) : 0;

	const availableFromMetrics = Number(seatMetrics?.availableSeats);
	const availableSeats = Number.isFinite(availableFromMetrics) && availableFromMetrics >= 0
		? Math.trunc(availableFromMetrics)
		: Math.max(totalSeats - bookedSeats, 0);

	const lockedFromMetrics = Number(seatMetrics?.lockedSeats);
	const lockedSeats = Number.isFinite(lockedFromMetrics) && lockedFromMetrics >= 0 ? Math.trunc(lockedFromMetrics) : 0;

	const bookedPercent = totalSeats > 0 ? Math.min(100, Math.max(0, Math.round((bookedSeats / totalSeats) * 100))) : 0;

	return {
		totalSeats,
		bookedSeats,
		availableSeats,
		lockedSeats,
		bookedPercent,
	};
};

export default function ScheduleCard({
	schedule,
	fareLabel,
	seatMetrics,
	isSeatLoading,
	actionLoading,
	onEdit,
	onDelete,
	onViewDetails,
}) {
	const isActive = schedule?.isActive !== false;
	const busName = String(schedule?.bus?.name || "Bus").trim() || "Bus";
	const busNumber = String(schedule?.bus?.vehicleNumber || "N/A").trim() || "N/A";

	const departureLabel = `${schedule?.date || "-"} ${formatTime(schedule?.time)}`;
	const arrivalDate = schedule?.arrivalDate || schedule?.date || "-";
	const arrivalTime = schedule?.arrivalTime ? formatTime(schedule.arrivalTime) : "-";

	const seat = normalizeSeatMetrics({ seatMetrics, schedule });

	return (
		<article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 hover:shadow md:p-5">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div>
					<div className="flex items-center gap-2 text-base font-bold text-slate-900">
						<BusFront className="h-4 w-4 text-sky-600" />
						<span>{busName}</span>
						<span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{busNumber}</span>
					</div>
					<div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
						<span
							className={`inline-flex rounded-full px-2.5 py-1 font-semibold ${
								isActive ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
							}`}
						>
							{isActive ? "Active" : "Inactive"}
						</span>
						{schedule?.refundable ? (
							<span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">
								Refundable
							</span>
						) : null}
					</div>
				</div>
			</div>

			<div className="mt-4 grid gap-3 sm:grid-cols-2">
				<div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
					<div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
						<Clock3 className="h-3.5 w-3.5" />
						Departure to Arrival
					</div>
					<div className="mt-1 text-sm font-semibold text-slate-800">{departureLabel}</div>
					<div className="text-sm text-slate-600">{arrivalDate} {arrivalTime}</div>
				</div>

				<div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
					<div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
						<BadgeDollarSign className="h-3.5 w-3.5" />
						Price
					</div>
					<div className="mt-1 text-sm font-semibold text-slate-800">{fareLabel}</div>
				</div>
			</div>

			<div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
						<Users className="h-3.5 w-3.5" />
						Seat availability
					</div>
					<span className="text-xs font-semibold text-slate-600">{seat.bookedPercent}% booked</span>
				</div>

				<div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
					<div className="h-full rounded-full bg-sky-500 transition-all" style={{ width: `${seat.bookedPercent}%` }} />
				</div>

				<div className="mt-3 grid grid-cols-3 gap-2 text-xs">
					<div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-600">
						<div className="font-semibold text-slate-700">Total</div>
						<div>{seat.totalSeats}</div>
					</div>
					<div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-600">
						<div className="font-semibold text-slate-700">Booked</div>
						<div>{seat.bookedSeats}</div>
					</div>
					<div className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-600">
						<div className="font-semibold text-slate-700">Available</div>
						<div>{seat.availableSeats}</div>
					</div>
				</div>

				{isSeatLoading ? <div className="mt-2 text-xs text-slate-500">Loading seat stats...</div> : null}
				{seatMetrics?.error ? (
					<div className="mt-2 text-xs text-amber-700">Seat stats may be partial: {seatMetrics.error}</div>
				) : null}
				{seat.lockedSeats > 0 ? (
					<div className="mt-2 text-xs font-medium text-amber-700">{seat.lockedSeats} seats are currently locked.</div>
				) : null}
			</div>

			<div className="mt-4 flex flex-wrap items-center gap-2">
				<button
					type="button"
					onClick={onViewDetails}
					className="inline-flex items-center gap-1 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
				>
					<Eye className="h-3.5 w-3.5" />
					View Details
				</button>
				<button
					type="button"
					disabled={actionLoading}
					onClick={onEdit}
					className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
				>
					<Pencil className="h-3.5 w-3.5" />
					Edit
				</button>
				<button
					type="button"
					disabled={actionLoading}
					onClick={onDelete}
					className="inline-flex items-center gap-1 rounded-xl border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-60"
				>
					<Trash2 className="h-3.5 w-3.5" />
					Delete
				</button>
			</div>
		</article>
	);
}
