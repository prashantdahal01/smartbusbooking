import { ChevronRight, Pencil, Trash2 } from "lucide-react";

const getRoutePointBadgeLabel = (route) => {
  const boardingCount = Array.isArray(route?.boardingPoints) ? route.boardingPoints.length : 0;
  const droppingCount = Array.isArray(route?.droppingPoints) ? route.droppingPoints.length : 0;

  if (boardingCount > 0 || droppingCount > 0) {
    return `${boardingCount} boarding | ${droppingCount} dropping`;
  }

  const legacyStops = Array.isArray(route?.stops) ? route.stops.length : 0;
  return `${legacyStops} stops`;
};

export default function RouteList({
  routes = [],
  loading = false,
  selectedRouteId = "",
  onSelect,
  onEdit,
  onDelete,
  disableActions = false,
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={`route-skeleton-${index}`} className="admin-surface p-4">
            <div className="skeleton h-5 w-2/3" />
            <div className="mt-3 skeleton h-4 w-1/2" />
            <div className="mt-3 skeleton h-8 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (routes.length === 0) {
    return (
      <div className="admin-surface px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
        No routes found.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {routes.map((route) => {
        const isActive = String(route._id) === String(selectedRouteId);

        return (
          <article
            key={route._id}
            className={`rounded-xl border p-4 transition-all ${
              isActive
                ? "border-blue-200 bg-blue-50/70 shadow-sm dark:border-blue-800 dark:bg-blue-900/20"
                : "border-slate-200 bg-white hover:shadow-sm dark:border-slate-700 dark:bg-slate-900"
            }`}
          >
            <button
              type="button"
              onClick={() => onSelect(route)}
              className="flex w-full items-start justify-between gap-3 text-left"
            >
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {route.source} to {route.destination}
                </p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Distance: {route.distance} km</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                    {getRoutePointBadgeLabel(route)}
                  </span>
                </div>
              </div>
              <ChevronRight className="mt-1 h-4 w-4 text-slate-400" />
            </button>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onEdit(route)}
                disabled={disableActions}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-blue-200 px-2.5 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-900/30"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>
              <button
                type="button"
                onClick={() => onDelete(route)}
                disabled={disableActions}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-rose-200 px-2.5 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/30"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
