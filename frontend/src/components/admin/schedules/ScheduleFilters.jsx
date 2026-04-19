import { Filter, RefreshCcw, Search } from "lucide-react";

const STATUS_OPTIONS = [
	{ value: "all", label: "All status" },
	{ value: "active", label: "Active" },
	{ value: "inactive", label: "Inactive" },
];

const SORT_OPTIONS = [
	{ value: "departure", label: "Departure time" },
	{ value: "price", label: "Price" },
];

export default function ScheduleFilters({
	searchQuery,
	onSearchQueryChange,
	dateFilter,
	onDateFilterChange,
	statusFilter,
	onStatusFilterChange,
	sortBy,
	onSortByChange,
	onReset,
	totalCount,
	visibleCount,
}) {
	return (
		<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<div className="text-sm font-semibold text-slate-900">Search and Filter</div>
					<div className="text-xs text-slate-500">
						Showing {visibleCount} of {totalCount} schedules
					</div>
				</div>
				<button
					type="button"
					onClick={onReset}
					className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
				>
					<RefreshCcw className="h-3.5 w-3.5" />
					Reset
				</button>
			</div>

			<div className="mt-4 grid gap-3 lg:grid-cols-4">
				<label className="relative block lg:col-span-2">
					<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
					<input
						type="text"
						value={searchQuery}
						onChange={(event) => onSearchQueryChange(event.target.value)}
						placeholder="Search by bus name/number or route"
						className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
					/>
				</label>

				<label className="relative block">
					<input
						type="date"
						value={dateFilter}
						onChange={(event) => onDateFilterChange(event.target.value)}
						className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
					/>
				</label>

				<label className="relative block">
					<select
						value={statusFilter}
						onChange={(event) => onStatusFilterChange(event.target.value)}
						className="h-11 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 pr-10 text-sm text-slate-800 outline-none transition focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
					>
						{STATUS_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
					<Filter className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
				</label>
			</div>

			<div className="mt-3 flex flex-wrap items-center gap-2">
				<span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sort inside route</span>
				{SORT_OPTIONS.map((option) => {
					const active = sortBy === option.value;
					return (
						<button
							key={option.value}
							type="button"
							onClick={() => onSortByChange(option.value)}
							className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
								active
									? "border-sky-300 bg-sky-50 text-sky-700"
									: "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
							}`}
						>
							{option.label}
						</button>
					);
				})}
			</div>
		</div>
	);
}
