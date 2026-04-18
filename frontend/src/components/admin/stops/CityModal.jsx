import { useEffect, useMemo, useState } from "react";
import { Building2, MapPin, X } from "lucide-react";

const normalizeKey = (value) => String(value || "").trim().toLowerCase();

export default function CityModal({
  open,
  mode = "create",
  district = null,
  city = null,
  existingCities = [],
  submitting = false,
  onClose,
  onSubmit,
}) {
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(String(city?.name || ""));
    setError("");
  }, [open, city]);

  const duplicate = useMemo(() => {
    const value = normalizeKey(name);
    if (!value) return false;

    return existingCities.some((item) => {
      const key = normalizeKey(item?.name);
      if (!key) return false;
      if (mode === "edit" && String(item?._id) === String(city?._id)) return false;
      return key === value;
    });
  }, [city?._id, existingCities, mode, name]);

  if (!open) return null;

  const handleSubmit = (event) => {
    event.preventDefault();
    setError("");

    const nextName = String(name || "").trim();
    if (!nextName) {
      setError("City name is required");
      return;
    }
    if (duplicate) {
      setError("A city with this name already exists in this district");
      return;
    }

    onSubmit({ name: nextName });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 px-4">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {mode === "edit" ? "Edit City" : "Add City"}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">{district ? `District: ${district.name}` : "Select district first"}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            aria-label="Close city modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>
          ) : null}

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <p className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> District: {district?.name || "-"}</p>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
              <MapPin className="h-4 w-4" />
              City Name
            </label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              required
              placeholder="e.g., Damak"
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
          </div>

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
              {submitting ? "Saving..." : mode === "edit" ? "Update City" : "Add City"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
