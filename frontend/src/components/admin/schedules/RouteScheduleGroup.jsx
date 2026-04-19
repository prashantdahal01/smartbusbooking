import { Bus, CalendarDays, ChevronDown, MapPin } from "lucide-react";
import { formatCurrency } from "../../../utils/helpers";

export default function RouteScheduleGroup({ group, isExpanded, onToggle, children }) {
	const summary = group?.summary || {};
	const avgPrice = Number(summary.avgPrice);
	const hasAvgPrice = Number.isFinite(avgPrice) && avgPrice > 0;

	return (
		<section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
			<button
				type="button"
				onClick={() => onToggle(group)}
				className="flex w-full flex-wrap items-center justify-between gap-3 bg-linear-to-r from-slate-50 to-sky-50 px-4 py-4 text-left transition hover:from-slate-100 hover:to-sky-100 sm:px-5"
			>
				<div>
					<div className="flex items-center gap-2 text-lg font-bold text-slate-900">
						<MapPin className="h-4 w-4 text-sky-600" />
						<span>{group.routeLabel}</span>
					</div>
					<div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
						<span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700">
							<CalendarDays className="h-3.5 w-3.5 text-slate-500" />
							{summary.totalSchedules || 0} schedules
						</span>
						<span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-1 font-semibold text-slate-700">
							<Bus className="h-3.5 w-3.5 text-slate-500" />
							{summary.totalBuses || 0} buses running
						</span>
						{hasAvgPrice ? (
							<span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 font-semibold text-sky-700">
								Avg fare {formatCurrency(avgPrice)}
							</span>
						) : null}
					</div>
				</div>

				<span
					className={`inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white transition ${
						isExpanded ? "rotate-180" : "rotate-0"
					}`}
				>
					<ChevronDown className="h-4 w-4 text-slate-600" />
				</span>
			</button>

			{isExpanded ? <div className="border-t border-slate-100 p-4 sm:p-5">{children}</div> : null}
		</section>
	);
}
