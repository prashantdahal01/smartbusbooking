import { useMemo } from "react";
import { Route } from "lucide-react";

const normalizeKey = (value) => String(value || "").trim().toLowerCase();

const normalizeStopType = (value) => {
  const type = String(value || "pickup").trim().toLowerCase();
  if (type === "drop") return "drop";
  if (type === "both") return "both";
  return "pickup";
};

export default function RouteDetailPanel({
  route,
  loadingStops = false,
  stops = [],
}) {
  const summary = useMemo(() => {
    const source = String(route?.source || "").trim();
    const destination = String(route?.destination || "").trim();

    const rows = (Array.isArray(stops) ? stops : [])
      .map((stop, index) => {
        const name = String(stop?.name || "").trim();
        const type = normalizeStopType(stop?.type);
        const orderRaw = Number(stop?.order);
        const order = Number.isFinite(orderRaw) && Number.isInteger(orderRaw) && orderRaw > 0 ? orderRaw : index + 1;
        return {
          name,
          key: normalizeKey(name),
          type,
          order,
          sequence: index,
        };
      })
      .filter((stop) => stop.name && stop.key);

    const pickups = rows
      .filter((stop) => stop.type === "pickup" || stop.type === "both")
      .sort((a, b) => a.order - b.order || a.sequence - b.sequence || a.name.localeCompare(b.name));

    const dropoffs = rows
      .filter((stop) => stop.type === "drop" || stop.type === "both")
      .sort((a, b) => a.order - b.order || a.sequence - b.sequence || a.name.localeCompare(b.name));

    const pathStops = [];
    const seen = new Set();
    [...pickups, ...dropoffs].forEach((stop) => {
      if (seen.has(stop.key)) return;
      seen.add(stop.key);
      pathStops.push(stop.name);
    });

    const fullPath = [];
    const appendPathCity = (name) => {
      const city = String(name || "").trim();
      if (!city) return;
      const cityKey = normalizeKey(city);
      if (!cityKey) return;

      const previous = fullPath[fullPath.length - 1];
      if (normalizeKey(previous) === cityKey) return;
      fullPath.push(city);
    };

    appendPathCity(source);
    pathStops.forEach(appendPathCity);
    appendPathCity(destination);

    return {
      managedStopCount: rows.length,
      pickupCount: pickups.length,
      dropCount: dropoffs.length,
      totalRoutePoints: fullPath.length,
      pathText: fullPath.join(" -> "),
      pickupPathText: pickups.map((stop) => stop.name).join(" -> "),
      dropPathText: dropoffs.map((stop) => stop.name).join(" -> "),
    };
  }, [route?.destination, route?.source, stops]);

  if (!route) {
    return (
      <div className="admin-surface grid min-h-120 place-items-center p-8 text-center">
        <div>
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Select a route</h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Choose a route from the left panel to preview route summary.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-surface min-h-120 p-5 sm:p-6">
      <div>
        <div>
          <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {route.source} to {route.destination}
          </h3>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Distance: {route.distance} km</p>
        </div>
      </div>

      <div className="mt-5 space-y-3">
        {loadingStops ? (
          Array.from({ length: 5 }).map((_, index) => (
            <div key={`detail-stop-skeleton-${index}`} className="skeleton h-24 w-full rounded-xl" />
          ))
        ) : (
          <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
                <Route className="h-4 w-4" />
                Bus route
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
                {summary.managedStopCount} managed stops • {summary.pickupCount} pickups • {summary.dropCount} dropoffs
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{summary.totalRoutePoints} route points in path</p>
              <p className="mt-2 wrap-break-word text-sm text-slate-700 dark:text-slate-200">{summary.pathText || "-"}</p>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900/40 dark:bg-emerald-900/10">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                Pickup Sequence
              </p>
              <p className="mt-1 wrap-break-word text-sm text-slate-700 dark:text-slate-200">{summary.pickupPathText || "-"}</p>
            </div>

            <div className="rounded-xl border border-rose-200 bg-rose-50/60 p-3 dark:border-rose-900/40 dark:bg-rose-900/10">
              <p className="text-xs font-semibold uppercase tracking-wide text-rose-700 dark:text-rose-300">
                Drop Sequence
              </p>
              <p className="mt-1 wrap-break-word text-sm text-slate-700 dark:text-slate-200">{summary.dropPathText || "-"}</p>
            </div>

            {summary.managedStopCount === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 px-4 py-3 text-center text-xs text-slate-500 dark:border-slate-600 dark:text-slate-400">
                No managed stops yet. Configure stops from Stop Management.
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
