import { AlertTriangle, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
const addDays = (date, amount) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);

const parseDateKey = (value) => {
	const raw = String(value || "").trim();
	if (!DATE_RE.test(raw)) return null;

	const [yearRaw, monthRaw, dayRaw] = raw.split("-");
	const year = Number(yearRaw);
	const month = Number(monthRaw);
	const day = Number(dayRaw);
	if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;

	const parsed = new Date(year, month - 1, day);
	if (Number.isNaN(parsed.getTime())) return null;
	if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;

	return startOfDay(parsed);
};

const formatDateKey = (date) => {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
};

const formatDateLabel = (dateKey) => {
	const parsed = parseDateKey(dateKey);
	if (!parsed) return dateKey;
	return parsed.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
};

const buildCalendarGrid = (currentMonth) => {
	const monthStart = startOfMonth(currentMonth);
	const firstWeekday = monthStart.getDay();
	const gridStart = addDays(monthStart, -firstWeekday);

	return Array.from({ length: 42 }, (_, index) => {
		const date = addDays(gridStart, index);
		return {
			key: formatDateKey(date),
			date,
			dayLabel: date.getDate(),
			inCurrentMonth: date.getMonth() === monthStart.getMonth(),
		};
	});
};

const sortDateKeys = (dateKeys) => {
	const parsed = (Array.isArray(dateKeys) ? dateKeys : [])
		.map((dateKey) => {
			const parsedDate = parseDateKey(dateKey);
			if (!parsedDate) return null;
			return {
				key: formatDateKey(parsedDate),
				ts: parsedDate.getTime(),
			};
		})
		.filter(Boolean);

	const unique = Array.from(new Map(parsed.map((item) => [item.key, item])).values());
	unique.sort((left, right) => left.ts - right.ts);
	return unique.map((item) => item.key);
};

const resolveMinDate = (minDate) => {
	const today = startOfDay(new Date());
	const parsedMin = parseDateKey(minDate);
	if (!parsedMin) return today;
	return parsedMin.getTime() < today.getTime() ? today : parsedMin;
};

export default function MultiDatePicker({
	selectedDates = [],
	onChange,
	minDate,
	conflictDates = [],
	disabled = false,
	error = "",
}) {
	const selectedKeys = useMemo(() => sortDateKeys(selectedDates), [selectedDates]);
	const selectedSet = useMemo(() => new Set(selectedKeys), [selectedKeys]);
	const conflictSet = useMemo(() => new Set(sortDateKeys(conflictDates)), [conflictDates]);
	const minAllowedDate = useMemo(() => resolveMinDate(minDate), [minDate]);

	const [currentMonth, setCurrentMonth] = useState(() => {
		const firstSelected = parseDateKey(selectedKeys[0]);
		const base = firstSelected || minAllowedDate;
		return startOfMonth(base);
	});

	useEffect(() => {
		const firstSelected = parseDateKey(selectedKeys[0]);
		if (!firstSelected) return;

		const nextMonth = startOfMonth(firstSelected);
		if (
			currentMonth.getFullYear() === nextMonth.getFullYear()
			&& currentMonth.getMonth() === nextMonth.getMonth()
		) {
			return;
		}

		setCurrentMonth(nextMonth);
	}, [currentMonth, selectedKeys]);

	const monthLabel = useMemo(
		() => currentMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
		[currentMonth]
	);
	const calendarDays = useMemo(() => buildCalendarGrid(currentMonth), [currentMonth]);

	const isDisabledDate = (date) => date.getTime() < minAllowedDate.getTime();

	const emit = (nextDateKeys) => {
		if (typeof onChange === "function") {
			onChange(sortDateKeys(nextDateKeys));
		}
	};

	const toggleDate = (date) => {
		if (disabled || isDisabledDate(date)) return;
		const dateKey = formatDateKey(date);
		if (selectedSet.has(dateKey)) {
			emit(selectedKeys.filter((item) => item !== dateKey));
			return;
		}

		emit([...selectedKeys, dateKey]);
	};

	const removeDate = (dateKey) => {
		if (disabled) return;
		emit(selectedKeys.filter((item) => item !== dateKey));
	};

	return (
		<div>
			<div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
				<div className="mb-3 flex items-center justify-between">
					<button
						type="button"
						onClick={() => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
						disabled={disabled}
						className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
						aria-label="Previous month"
					>
						<ChevronLeft className="h-4 w-4" />
					</button>

					<div className="text-sm font-semibold text-slate-900">{monthLabel}</div>

					<button
						type="button"
						onClick={() => setCurrentMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
						disabled={disabled}
						className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition hover:border-blue-300 hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
						aria-label="Next month"
					>
						<ChevronRight className="h-4 w-4" />
					</button>
				</div>

				<div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">
					{WEEKDAY_LABELS.map((weekday) => (
						<div key={weekday} className="py-1">
							{weekday}
						</div>
					))}
				</div>

				<div className="grid grid-cols-7 gap-1">
					{calendarDays.map((cell) => {
						const selected = selectedSet.has(cell.key);
						const hasConflict = conflictSet.has(cell.key);
						const disabledDate = disabled || isDisabledDate(cell.date);

						return (
							<button
								key={cell.key}
								type="button"
								disabled={disabledDate}
								onClick={() => toggleDate(cell.date)}
								className={[
									"relative h-10 rounded-lg text-sm font-semibold transition",
									cell.inCurrentMonth ? "text-slate-800" : "text-slate-400",
									selected ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-white hover:bg-blue-50 hover:text-blue-700",
									hasConflict && !selected ? "ring-1 ring-amber-400" : "",
									disabledDate ? "cursor-not-allowed opacity-50 hover:bg-white hover:text-slate-400" : "",
								].join(" ")}
							>
								<span>{cell.dayLabel}</span>
								{hasConflict ? (
									<AlertTriangle className={`absolute right-0.5 top-0.5 h-3.5 w-3.5 ${selected ? "text-white" : "text-amber-600"}`} />
								) : null}
							</button>
						);
					})}
				</div>
			</div>

			<div className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
				<div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Selected Dates ({selectedKeys.length})</div>
				{selectedKeys.length === 0 ? (
					<div className="mt-2 text-xs text-slate-500">No dates selected yet. Click dates on the calendar to toggle them.</div>
				) : (
					<div className="mt-2 flex flex-wrap gap-2">
						{selectedKeys.map((dateKey) => {
							const hasConflict = conflictSet.has(dateKey);
							return (
								<span
									key={dateKey}
									className={[
										"inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
										hasConflict
											? "border-amber-300 bg-amber-50 text-amber-800"
											: "border-blue-200 bg-blue-50 text-blue-800",
									].join(" ")}
								>
									{hasConflict ? <AlertTriangle className="h-3.5 w-3.5" /> : null}
									{formatDateLabel(dateKey)}
									<button
										type="button"
										disabled={disabled}
										onClick={() => removeDate(dateKey)}
										className="rounded-full p-0.5 text-current/70 transition hover:bg-white hover:text-current disabled:cursor-not-allowed disabled:opacity-60"
										aria-label={`Remove ${formatDateLabel(dateKey)}`}
									>
										<X className="h-3 w-3" />
									</button>
								</span>
							);
						})}
					</div>
				)}
			</div>

			{error ? <p className="mt-2 text-xs font-medium text-red-600">{error}</p> : null}
		</div>
	);
}
