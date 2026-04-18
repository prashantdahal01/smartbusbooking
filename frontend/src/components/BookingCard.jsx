// Card component summarizing a booking (route, date, seats, fare, status)
// Used in customer dashboard and booking confirmation
import { motion } from "framer-motion";
import { BusFront, CalendarDays, Clock3, MapPin, Ticket } from "lucide-react";
import { useMemo } from "react";
import { formatCurrency } from "../utils/helpers";

const statusClasses = {
  confirmed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  cancelled: "border-rose-200 bg-rose-50 text-rose-700",
  payment_pending: "border-amber-200 bg-amber-50 text-amber-700",
  payment_failed: "border-slate-300 bg-slate-100 text-slate-700",
};

const formatDateLabel = (rawDate) => {
  const text = String(rawDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return text || "Date N/A";
  const parsed = new Date(`${text}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
};

export default function BookingCard({ booking }) {
	if (!booking) return null;
	const route = booking.schedule?.route;
	const bus = booking.schedule?.bus;

	const seatLabels = Array.isArray(booking?.seats) ? booking.seats : [];
	const seatCount = seatLabels.length;

	const totalPrice = useMemo(() => {
		const explicit = Number(booking?.totalPrice);
		if (Number.isFinite(explicit) && explicit >= 0) return explicit;

		const schedulePrice = Number(booking?.schedule?.price);
		if (Number.isFinite(schedulePrice) && schedulePrice >= 0) {
			return seatCount > 0 ? schedulePrice * seatCount : schedulePrice;
		}

		return 0;
	}, [booking?.schedule?.price, booking?.totalPrice, seatCount]);

	const onOpenTicketInNewTab = () => {
		if (!booking?._id) return;

		const targetPath = `/ticket/${booking._id}`;
		const newTab = window.open(targetPath, "_blank", "noopener,noreferrer");
		if (!newTab) {
			window.location.assign(targetPath);
		}
	};

	const statusText = String(booking?.status || "unknown").replace(/_/g, " ");
	const statusClass = statusClasses[booking?.status] || "border-slate-300 bg-slate-100 text-slate-700";
	const dateLabel = formatDateLabel(booking?.schedule?.date);
	const timeLabel = String(booking?.schedule?.time || "Time N/A").trim() || "Time N/A";
	const boardingName = String(booking?.boardingPoint?.name || "N/A").trim() || "N/A";
	const droppingName = String(booking?.droppingPoint?.name || "N/A").trim() || "N/A";

	return (
		<motion.article
			initial={{ opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			whileHover={{ y: -2 }}
			transition={{ duration: 0.22 }}
			className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
		>
			<div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1fr_auto] lg:items-start">
				<div className="space-y-3">
					<div className="flex flex-wrap items-center gap-2">
						<p className="inline-flex items-center gap-2 text-lg font-bold text-slate-900">
							<BusFront className="h-5 w-5 text-violet-600" />
							{route?.source || "Source"} -&gt; {route?.destination || "Destination"}
						</p>
						<span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusClass}`}>
							{statusText}
						</span>
					</div>

					<div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
						<p className="inline-flex items-center gap-2">
							<CalendarDays className="h-4 w-4 text-violet-600" />
							{dateLabel}
						</p>
						<p className="inline-flex items-center gap-2">
							<Clock3 className="h-4 w-4 text-violet-600" />
							{timeLabel}
						</p>
						<p className="inline-flex items-center gap-2 sm:col-span-2">
							<Ticket className="h-4 w-4 text-violet-600" />
							Bus: {String(bus?.name || "N/A").trim() || "N/A"}
						</p>
					</div>

					<div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-2">
						<div>
							<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Seats</p>
							<p className="mt-0.5 font-semibold text-slate-800">{seatLabels.length > 0 ? seatLabels.join(", ") : "N/A"}</p>
						</div>
						<div>
							<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Passengers</p>
							<p className="mt-0.5 font-semibold text-slate-800">{seatCount || 1}</p>
						</div>
						<div>
							<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Boarding</p>
							<p className="mt-0.5 inline-flex items-center gap-1.5 font-semibold text-slate-800">
								<MapPin className="h-3.5 w-3.5 text-violet-600" />
								{boardingName}
							</p>
						</div>
						<div>
							<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dropping</p>
							<p className="mt-0.5 inline-flex items-center gap-1.5 font-semibold text-slate-800">
								<MapPin className="h-3.5 w-3.5 text-violet-600" />
								{droppingName}
							</p>
						</div>
					</div>
				</div>

				<div className="flex min-w-48 flex-row items-end justify-between gap-3 sm:flex-col sm:items-end">
					<div className="text-right">
						<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Paid</p>
						<p className="bg-linear-to-r from-violet-600 to-purple-700 bg-clip-text text-2xl font-extrabold text-transparent">
							{formatCurrency(totalPrice)}
						</p>
					</div>

					<div className="flex flex-wrap justify-end gap-2">
						{booking?.status === "confirmed" ? (
							<motion.button
								type="button"
								onClick={onOpenTicketInNewTab}
								whileHover={{ y: -1, scale: 1.01 }}
								whileTap={{ scale: 0.98 }}
								className="rounded-lg bg-linear-to-r from-violet-600 to-purple-700 px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(124,58,237,0.32)] transition hover:from-violet-700 hover:to-purple-800 disabled:opacity-65"
							>
								Open E-Ticket
							</motion.button>
						) : null}
					</div>
				</div>
			</div>
		</motion.article>
	);
}
