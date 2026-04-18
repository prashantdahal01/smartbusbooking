import { Pencil, Plus, Trash2 } from "lucide-react";

const stopTypeLabel = (type) => {
  const normalized = String(type || "pickup").toLowerCase();
  if (normalized === "drop") return "Drop";
  if (normalized === "both") return "Both";
  return "Pickup";
};

const typeBadgeClass = (type) => {
  const normalized = String(type || "pickup").toLowerCase();
  if (normalized === "drop") return "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300";
  if (normalized === "both") return "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300";
  return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
};

export default function StopCard({
  city,
  district,
  stop,
  kmFromSource,
  routeSelected,
  busy = false,
  onToggle,
  onAdd,
  onEdit,
  onDelete,
}) {
  const enabled = Boolean(stop?._id);

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-4 transition hover:shadow-sm dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{city?.name || "Unknown city"}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{district?.name || "Unknown district"}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              KM: {kmFromSource !== null && kmFromSource !== undefined ? kmFromSource : "-"}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              Order: {stop?.order ?? "-"}
            </span>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              Time: {stop?.absoluteTime || "-"}
            </span>
          </div>
        </div>

        <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!routeSelected || busy}
            onChange={(event) => onToggle(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-blue-600"
          />
          Enabled
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {enabled ? (
          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${typeBadgeClass(stop?.type)}`}>
            {stopTypeLabel(stop?.type)}
          </span>
        ) : (
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            Disabled
          </span>
        )}

        <div className="flex items-center gap-2">
          {enabled ? (
            <>
              <button
                type="button"
                onClick={onEdit}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-900/30"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={busy}
                className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/30"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onAdd}
              disabled={!routeSelected || busy}
              className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-900/30"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Stop
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
