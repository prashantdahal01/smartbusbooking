// Card component displaying bus details (name, type, departure time, fare, seats)
// Used in search results listing
import { Link } from "react-router-dom";
import { formatCurrency, getBusImageUrl } from "../utils/helpers";
import { getBusTypeSummary } from "../utils/busTypeUtils";

export default function BusCard({ schedule }) {
	if (!schedule) return null;
	const img = getBusImageUrl(schedule?.bus, "bus");
	const title = schedule.bus?.name || "Bus";
	return (
		<div className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
			<div className="flex flex-col gap-4 p-4 lg:flex-row lg:gap-5 lg:p-5">
				<div className="h-40 w-full shrink-0 overflow-hidden rounded-xl bg-slate-100 lg:h-28 lg:w-40">
					{img ? (
						<img src={img} alt={title} loading="lazy" decoding="async" className="h-full w-full object-cover" />
					) : (
						<div className="flex h-full w-full items-center justify-center text-xs text-slate-500">No image</div>
					)}
				</div>

				<div className="min-w-0 flex flex-1 flex-col">
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div className="min-w-0">
							<div className="truncate text-lg font-extrabold text-slate-900">{title}</div>
							<div className="mt-1 text-sm text-slate-600">
								{schedule.route?.source} → {schedule.route?.destination}
							</div>
							<div className="mt-1 text-xs text-slate-500">
								{schedule.date} • {schedule.time}
							</div>
						</div>
						<div className="shrink-0 text-right">
							<div className="text-xs text-slate-500">Starting from</div>
							<div className="text-lg font-extrabold text-orange-500">{formatCurrency(schedule.price)}</div>
						</div>
					</div>

					<div className="mt-3 flex flex-wrap gap-2 text-xs">
						<span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-700">{getBusTypeSummary(schedule.bus, 2)}</span>
						<span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-700">{schedule.bus?.totalSeats || 0} seats</span>
						{schedule.route?.distance ? (
							<span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-700">{schedule.route.distance} km</span>
						) : null}
					</div>

					<div className="mt-4 flex items-center justify-end lg:mt-auto">
						<Link
							to={`/seats/${schedule._id}`}
							className="inline-flex items-center justify-center rounded-xl bg-orange-400 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-500"
						>
							View seats
						</Link>
					</div>
				</div>
			</div>
		</div>
	);
}
