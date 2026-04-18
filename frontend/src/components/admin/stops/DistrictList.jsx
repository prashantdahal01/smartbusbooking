import { Pencil, Plus, Trash2 } from "lucide-react";

const normalizeKey = (value) => String(value || "").trim().toLowerCase();

const getCityCount = (district) => {
  if (Array.isArray(district?.cityObjects)) return district.cityObjects.length;
  if (Array.isArray(district?.cities)) return district.cities.length;
  return 0;
};

export default function DistrictList({
  districts = [],
  loading = false,
  selectedDistrictId = "",
  stopCountByDistrictKey = new Map(),
  disableActions = false,
  onSelect,
  onEdit,
  onAddCity,
  onDelete,
}) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={`district-skeleton-${index}`} className="admin-surface p-4">
            <div className="skeleton h-5 w-2/3" />
            <div className="mt-3 skeleton h-4 w-1/2" />
            <div className="mt-3 skeleton h-8 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (districts.length === 0) {
    return (
      <div className="admin-surface px-4 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
        No districts found.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {districts.map((district) => {
        const selected = String(district?._id) === String(selectedDistrictId);
        const districtKey = normalizeKey(district?.key || district?.name);
        const stopCount = stopCountByDistrictKey.get(districtKey) || 0;

        return (
          <article
            key={district._id}
            className={`rounded-xl border p-4 transition-all ${
              selected
                ? "border-blue-200 bg-blue-50/70 shadow-sm dark:border-blue-800 dark:bg-blue-900/20"
                : "border-slate-200 bg-white hover:shadow-sm dark:border-slate-700 dark:bg-slate-900"
            }`}
          >
            <button type="button" onClick={() => onSelect(district)} className="w-full text-left">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{district.name}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {getCityCount(district)} cities
                </span>
                <span className="rounded-full bg-blue-100 px-2.5 py-1 font-semibold text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">
                  {stopCount} active stops
                </span>
              </div>
            </button>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => onEdit(district)}
                disabled={disableActions}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-blue-200 px-2.5 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 disabled:opacity-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-900/30"
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </button>

              <button
                type="button"
                onClick={() => onAddCity(district)}
                disabled={disableActions}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                <Plus className="h-3.5 w-3.5" />
                City
              </button>

              <button
                type="button"
                onClick={() => onDelete(district)}
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
