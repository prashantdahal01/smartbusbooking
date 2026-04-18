import { useEffect, useMemo, useState } from "react";
import { Building2, Plus, Trash2, X } from "lucide-react";

const normalizeKey = (value) => String(value || "").trim().toLowerCase();

const getInitialState = (mode, district) => ({
  name: String(district?.name || ""),
  cities: mode === "create" ? [""] : [],
});

export default function DistrictModal({
  open,
  mode = "create",
  district = null,
  submitting = false,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(getInitialState(mode, district));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(getInitialState(mode, district));
    setError("");
  }, [open, mode, district]);

  const duplicateCityError = useMemo(() => {
    if (mode !== "create") return "";
    const seen = new Set();

    for (let i = 0; i < form.cities.length; i += 1) {
      const city = String(form.cities[i] || "").trim();
      if (!city) continue;
      const key = normalizeKey(city);
      if (seen.has(key)) return "Duplicate city names are not allowed";
      seen.add(key);
    }

    return "";
  }, [form.cities, mode]);

  if (!open) return null;

  const submitForm = (event) => {
    event.preventDefault();
    setError("");

    const name = String(form.name || "").trim();
    if (!name) {
      setError("District name is required");
      return;
    }

    if (mode === "create") {
      const cities = form.cities
        .map((city) => String(city || "").trim())
        .filter(Boolean);

      if (cities.length === 0) {
        setError("At least one city is required");
        return;
      }
      if (duplicateCityError) {
        setError(duplicateCityError);
        return;
      }

      onSubmit({ name, cities });
      return;
    }

    onSubmit({ name });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 px-4">
      <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {mode === "edit" ? "Edit District" : "Add District"}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {mode === "edit"
                ? "Rename district and keep dependent stop mappings synced"
                : "Create district with one or more cities"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            aria-label="Close district modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submitForm} className="space-y-4 px-5 py-5">
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              <Building2 className="h-4 w-4" />
              District Name
            </label>
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              required
              placeholder="e.g., Jhapa"
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
          </div>

          {mode === "create" ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Cities</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Add initial cities for this district</p>
                </div>
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, cities: [...prev.cities, ""] }))}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add City
                </button>
              </div>

              <div className="mt-3 space-y-2">
                {form.cities.map((city, index) => (
                  <div key={`city-${index}`} className="flex items-center gap-2">
                    <input
                      value={city}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          cities: prev.cities.map((item, i) => (i === index ? event.target.value : item)),
                        }))
                      }
                      placeholder="e.g., Kakarvitta"
                      className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          cities: prev.cities.length <= 1 ? [""] : prev.cities.filter((_, i) => i !== index),
                        }))
                      }
                      className="inline-flex h-10 items-center rounded-lg border border-rose-200 px-2 text-rose-700 transition hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-900/30"
                      aria-label="Remove city input"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Saving..." : mode === "edit" ? "Update District" : "Create District"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
