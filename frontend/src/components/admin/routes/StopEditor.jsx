import { Pencil, Trash2 } from "lucide-react";

const toSafeNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toDisplayType = (value) => {
  const type = String(value || "pickup").toLowerCase();
  if (type === "drop") return "Drop";
  if (type === "both") return "Both";
  return "Pickup";
};

export default function StopEditor({ stop, onEdit, onDelete, disableActions = false }) {
  const km = toSafeNumber(stop?.kmFromSource);

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 transition hover:shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{stop?.name || "Unnamed stop"}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {km !== null ? `${km} km` : "KM not set"}
            </span>
            <span className="rounded-full bg-blue-100 px-2.5 py-1 font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
              {toDisplayType(stop?.type)}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              Offset: {stop?.offsetMinutes === null || stop?.offsetMinutes === undefined || stop?.offsetMinutes === "" ? "-" : `${stop.offsetMinutes} min`}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              Time: {stop?.absoluteTime || "-"}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            disabled={disableActions}
            className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-900/30"
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={disableActions}
            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/30"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}
