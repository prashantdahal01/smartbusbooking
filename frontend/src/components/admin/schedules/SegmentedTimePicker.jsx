import { Clock3 } from "lucide-react";
import { useMemo } from "react";

const TIME_RE = /^\d{2}:\d{2}$/;

const HOUR_OPTIONS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

const parseTimeValue = (value) => {
	const raw = String(value || "").trim();
	if (!TIME_RE.test(raw)) return null;

	const [hoursRaw, minutesRaw] = raw.split(":");
	const hours24 = Number(hoursRaw);
	const minutes = Number(minutesRaw);
	if (!Number.isInteger(hours24) || hours24 < 0 || hours24 > 23) return null;
	if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) return null;

	const meridiem = hours24 >= 12 ? "PM" : "AM";
	const hour12 = hours24 % 12 || 12;

	return {
		hour12: String(hour12),
		minute: String(minutes).padStart(2, "0"),
		meridiem,
	};
};

const to24Hour = (hour12, meridiem) => {
	const h = Number(hour12);
	if (!Number.isInteger(h) || h < 1 || h > 12) return null;

	if (meridiem === "AM") return h === 12 ? 0 : h;
	if (meridiem === "PM") return h === 12 ? 12 : h + 12;
	return null;
};

const formatDisplay = (timeValue) => {
	const parsed = parseTimeValue(timeValue);
	if (!parsed) return "Select departure time";
	return `${parsed.hour12}:${parsed.minute} ${parsed.meridiem}`;
};

const getSelectClassName = (hasError) =>
	[
		"w-full rounded-xl border bg-white px-3 py-2 text-sm font-medium text-slate-800 outline-none transition",
		hasError
			? "border-red-300 focus:border-red-400 focus:ring-2 focus:ring-red-100"
			: "border-slate-200 hover:border-orange-300 focus:border-orange-300 focus:ring-2 focus:ring-orange-100",
	].join(" ");

export default function SegmentedTimePicker({
	label,
	value,
	onChange,
	error = "",
	helperText = "",
	disabled = false,
	idPrefix = "time-picker",
	required = false,
}) {
	const resolved = useMemo(() => {
		return parseTimeValue(value) || { hour12: "9", minute: "00", meridiem: "AM" };
	}, [value]);

	const updateTime = (nextParts) => {
		const merged = {
			hour12: nextParts.hour12 ?? resolved.hour12,
			minute: nextParts.minute ?? resolved.minute,
			meridiem: nextParts.meridiem ?? resolved.meridiem,
		};

		const hours24 = to24Hour(merged.hour12, merged.meridiem);
		if (hours24 === null) return;

		if (typeof onChange === "function") {
			onChange(`${String(hours24).padStart(2, "0")}:${merged.minute}`);
		}
	};

	return (
		<div>
			{label ? (
				<label className="block text-sm font-semibold text-slate-700">
					{label}
					{required ? <span className="ml-1 text-red-500">*</span> : null}
				</label>
			) : null}

			<div
				className={[
					"mt-2 rounded-2xl border p-3",
					error ? "border-red-300 bg-red-50/40" : "border-slate-200 bg-slate-50",
				].join(" ")}
			>
				<div className="mb-2 flex items-center justify-between gap-3">
					<span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
						<Clock3 className="h-3.5 w-3.5" />
						Time Picker
					</span>
					<span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 shadow-sm">
						{formatDisplay(value)}
					</span>
				</div>

				<div className="grid grid-cols-[1fr,1fr,auto] gap-2">
					<select
						id={`${idPrefix}-hour`}
						disabled={disabled}
						value={resolved.hour12}
						onChange={(event) => updateTime({ hour12: event.target.value })}
						className={getSelectClassName(Boolean(error))}
					>
						{HOUR_OPTIONS.map((hour) => (
							<option key={hour} value={hour}>
								{hour.padStart(2, "0")}
							</option>
						))}
					</select>

					<select
						id={`${idPrefix}-minute`}
						disabled={disabled}
						value={resolved.minute}
						onChange={(event) => updateTime({ minute: event.target.value })}
						className={getSelectClassName(Boolean(error))}
					>
						{MINUTE_OPTIONS.map((minute) => (
							<option key={minute} value={minute}>
								{minute}
							</option>
						))}
					</select>

					<div className="inline-flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
						{["AM", "PM"].map((period) => {
							const active = resolved.meridiem === period;
							return (
								<button
									key={period}
									type="button"
									disabled={disabled}
									onClick={() => updateTime({ meridiem: period })}
									className={[
										"px-3 py-2 text-xs font-semibold transition",
										active
											? "bg-orange-500 text-white"
											: "text-slate-700 hover:bg-orange-50 hover:text-orange-700",
									].join(" ")}
								>
									{period}
								</button>
							);
						})}
					</div>
				</div>
			</div>

			{error ? <p className="mt-2 text-xs font-medium text-red-600">{error}</p> : null}
			{!error && helperText ? <p className="mt-2 text-xs text-slate-500">{helperText}</p> : null}
		</div>
	);
}
