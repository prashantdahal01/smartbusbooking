import { Pencil, Plus, Trash2 } from "lucide-react";

const normalizeKey = (value) => String(value || "").trim().toLowerCase();

export default function CityList({
  district,
  cities = [],
  routeStopByCityKey = new Map(),
  disableActions = false,
  onAddCity,
  onEditCity,
  onDeleteCity,
}) {
  if (!district) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500 dark:border-slate-600 dark:text-slate-400">
        Select a district to manage cities.
      </div>
    );
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Cities</h4>
          <p className="text-xs text-slate-500 dark:text-slate-400">Manage cities inside {district.name}</p>
        </div>
        <button
          type="button"
          onClick={onAddCity}
          disabled={disableActions}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          <Plus className="h-3.5 w-3.5" />
          Add City
        </button>
      </div>

      {cities.length === 0 ? (
        <div className="mt-3 rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-500 dark:border-slate-600 dark:text-slate-400">
          No cities found in this district.
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-150 text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                <th className="py-2 font-semibold">City</th>
                <th className="py-2 font-semibold">Stop Status</th>
                <th className="py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {cities.map((city) => {
                const cityKey = normalizeKey(city?.key || city?.name);
                const hasStop = routeStopByCityKey.has(cityKey);

                return (
                  <tr key={city._id || cityKey} className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
                    <td className="py-2 text-slate-700 dark:text-slate-200">{city.name}</td>
                    <td className="py-2">
                      <span
                        className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          hasStop
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                            : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                        }`}
                      >
                        {hasStop ? "Mapped" : "Not mapped"}
                      </span>
                    </td>
                    <td className="py-2">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => onEditCity(city)}
                          disabled={disableActions}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-2.5 py-1.5 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-900/30"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteCity(city)}
                          disabled={disableActions}
                          className="inline-flex items-center gap-1 rounded-lg border border-rose-200 px-2.5 py-1.5 text-xs font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/30"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
