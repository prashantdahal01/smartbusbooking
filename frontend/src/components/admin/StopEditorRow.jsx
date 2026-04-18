import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";

const toOffsetInput = (value) => {
  if (value === null || value === undefined || value === "") return "";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "";
  return String(parsed);
};

export default function StopEditorRow({
  city,
  district,
  stop,
  disabled = false,
  busy = false,
  onToggleEnabled,
  onTypeChange,
  onOffsetCommit,
  onAbsoluteTimeCommit,
  onDelete,
}) {
  const [offsetValue, setOffsetValue] = useState(toOffsetInput(stop?.offsetMinutes));
  const [absoluteTime, setAbsoluteTime] = useState(String(stop?.absoluteTime || ""));

  useEffect(() => {
    setOffsetValue(toOffsetInput(stop?.offsetMinutes));
    setAbsoluteTime(String(stop?.absoluteTime || ""));
  }, [stop?._id, stop?.offsetMinutes, stop?.absoluteTime]);

  const isEnabled = Boolean(stop?._id);

  const statusPill = useMemo(() => {
    if (!isEnabled) {
      return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
    }
    if (stop?.type === "drop") {
      return "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300";
    }
    if (stop?.type === "both") {
      return "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300";
    }
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  }, [isEnabled, stop?.type]);

  const commitOffset = () => {
    if (!isEnabled || busy || disabled) return;
    const normalized = offsetValue === "" ? null : Number(offsetValue);
    if (normalized !== null && (!Number.isFinite(normalized) || normalized < 0)) return;
    onOffsetCommit(normalized === null ? null : Math.trunc(normalized));
  };

  const commitAbsoluteTime = () => {
    if (!isEnabled || busy || disabled) return;
    onAbsoluteTimeCommit(String(absoluteTime || "").trim());
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <input
            type="checkbox"
            checked={isEnabled}
            disabled={disabled || busy}
            onChange={(event) => onToggleEnabled(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-600"
          />
          <span>{city.name}</span>
          <span className="text-xs font-medium text-slate-400">({district.name})</span>
        </label>

        <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${statusPill}`}>
          {isEnabled ? String(stop?.type || "pickup") : "disabled"}
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Type</label>
          <select
            value={stop?.type || "pickup"}
            disabled={!isEnabled || disabled || busy}
            onChange={(event) => onTypeChange(event.target.value)}
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="pickup">Pickup</option>
            <option value="drop">Drop</option>
            <option value="both">Both</option>
          </select>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Offset (min)</label>
          <input
            type="number"
            min={0}
            step={1}
            value={offsetValue}
            disabled={!isEnabled || disabled || busy}
            onChange={(event) => setOffsetValue(event.target.value)}
            onBlur={commitOffset}
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Absolute Time</label>
          <input
            type="time"
            value={absoluteTime}
            disabled={!isEnabled || disabled || busy}
            onChange={(event) => setAbsoluteTime(event.target.value)}
            onBlur={commitAbsoluteTime}
            className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          />
        </div>

        <div className="flex items-end">
          <button
            type="button"
            disabled={!isEnabled || disabled || busy}
            onClick={onDelete}
            className="inline-flex h-9 w-full items-center justify-center gap-1 rounded-lg border border-rose-200 px-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-rose-800/70 dark:text-rose-300 dark:hover:bg-rose-900/30"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
