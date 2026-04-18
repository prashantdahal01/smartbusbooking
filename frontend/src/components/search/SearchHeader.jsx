import { CalendarDays, Filter, Route as RouteIcon } from "lucide-react";
import SortDropdown from "./SortDropdown";

export default function SearchHeader({
  tripCount,
  sourceLabel,
  destinationLabel,
  dateLabel,
  sortBy,
  sortOptions,
  onSortChange,
  onOpenFilters,
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-violet-600">{tripCount} Trips Found</p>
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-700 sm:text-base">
            <RouteIcon className="h-4 w-4 text-violet-500" />
            <span className="font-bold text-slate-900">{sourceLabel}</span>
            <span className="text-violet-600">-&gt;</span>
            <span className="font-bold text-slate-900">{destinationLabel}</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <CalendarDays className="h-4 w-4 text-violet-500" />
            <span>{dateLabel}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onOpenFilters}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-violet-300 hover:text-violet-700 lg:hidden"
          >
            <Filter className="h-4 w-4" />
            Filters
          </button>

          <SortDropdown value={sortBy} options={sortOptions} onChange={onSortChange} />
        </div>
      </div>
    </div>
  );
}
