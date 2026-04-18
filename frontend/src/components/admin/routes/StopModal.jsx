import { useEffect, useMemo, useState } from "react";
import { MapPin, X } from "lucide-react";

const STOP_TYPES = [
  { value: "pickup", label: "Pickup" },
  { value: "drop", label: "Drop" },
  { value: "both", label: "Both" },
];

const normalizeKey = (value) => String(value || "").trim().toLowerCase();

const getInitialState = (initialStop) => ({
  name: String(initialStop?.name || ""),
  kmFromSource:
    initialStop?.kmFromSource !== null && initialStop?.kmFromSource !== undefined && initialStop?.kmFromSource !== ""
      ? String(initialStop.kmFromSource)
      : "",
  type: String(initialStop?.type || "pickup").toLowerCase(),
  offsetMinutes:
    initialStop?.offsetMinutes !== null && initialStop?.offsetMinutes !== undefined && initialStop?.offsetMinutes !== ""
      ? String(initialStop.offsetMinutes)
      : "",
  absoluteTime: String(initialStop?.absoluteTime || ""),
});

export default function StopModal({
  open,
  mode = "create",
  initialStop,
  cityOptions = [],
  submitting = false,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(getInitialState(initialStop));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(getInitialState(initialStop));
    setError("");
  }, [open, initialStop]);

  const availableCities = useMemo(() => {
    const set = new Set();
    const list = [];

    cityOptions.forEach((city) => {
      const name = String(city || "").trim();
      const key = normalizeKey(name);
      if (!name || !key || set.has(key)) return;
      set.add(key);
      list.push(name);
    });

    const currentName = String(initialStop?.name || "").trim();
    const currentKey = normalizeKey(currentName);
    if (currentName && currentKey && !set.has(currentKey)) {
      list.push(currentName);
    }

    return list.sort((a, b) => a.localeCompare(b));
  }, [cityOptions, initialStop?.name]);

  if (!open) return null;

  const handleSubmit = (event) => {
    event.preventDefault();
    setError("");

    const name = String(form.name || "").trim();
    const km = Number(form.kmFromSource);
    const type = String(form.type || "pickup").toLowerCase();
    const absoluteTime = String(form.absoluteTime || "").trim();
    const offsetMinutes = form.offsetMinutes === "" ? null : Number(form.offsetMinutes);

    if (!name) {
      setError("Stop name is required");
      return;
    }

    if (!availableCities.some((city) => normalizeKey(city) === normalizeKey(name))) {
      setError("Please choose a valid city from the available list");
      return;
    }

    if (!Number.isFinite(km) || km <= 0) {
      setError("KM from source must be greater than 0");
      return;
    }

    if (!["pickup", "drop", "both"].includes(type)) {
      setError("Stop type is invalid");
      return;
    }

    if (offsetMinutes !== null && (!Number.isFinite(offsetMinutes) || offsetMinutes < 0)) {
      setError("Offset minutes must be a non-negative number");
      return;
    }

    if (absoluteTime && !/^\d{2}:\d{2}$/.test(absoluteTime)) {
      setError("Absolute time must be in HH:mm format");
      return;
    }

    onSubmit({
      name,
      kmFromSource: km,
      type,
      offsetMinutes,
      absoluteTime,
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 px-4">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {mode === "edit" ? "Edit Stop" : "Add Stop"}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Configure stop city, distance, and pickup/drop behavior
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            aria-label="Close stop modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
              {error}
            </div>
          ) : null}

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">City</label>
            <div className="relative mt-2">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                list="stop-city-options"
                placeholder="Select city"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
              <datalist id="stop-city-options">
                {availableCities.map((city) => (
                  <option key={city} value={city} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">KM from source</label>
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={form.kmFromSource}
                onChange={(event) => setForm((prev) => ({ ...prev, kmFromSource: event.target.value }))}
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Stop type</label>
              <select
                value={form.type}
                onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {STOP_TYPES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Offset minutes</label>
              <input
                type="number"
                min={0}
                value={form.offsetMinutes}
                onChange={(event) => setForm((prev) => ({ ...prev, offsetMinutes: event.target.value }))}
                placeholder="Optional"
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Absolute time (HH:mm)</label>
              <input
                value={form.absoluteTime}
                onChange={(event) => setForm((prev) => ({ ...prev, absoluteTime: event.target.value }))}
                placeholder="Optional"
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>
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
              {submitting ? "Saving..." : mode === "edit" ? "Save Stop" : "Add Stop"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
