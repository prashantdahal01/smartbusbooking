import { useEffect, useState } from "react";
import { MapPin, X } from "lucide-react";

const STOP_TYPES = [
  { value: "pickup", label: "Pickup" },
  { value: "drop", label: "Drop" },
  { value: "both", label: "Both" },
];

const getInitialState = (mode, stop, defaultType = "pickup", initialOrderIndex = null) => ({
  type: String(stop?.type || defaultType || "pickup").toLowerCase(),
  offsetMinutes:
    stop?.offsetMinutes !== null && stop?.offsetMinutes !== undefined && stop?.offsetMinutes !== ""
      ? String(stop.offsetMinutes)
      : "",
  absoluteTime: String(stop?.absoluteTime || ""),
  orderIndex:
    stop?.order !== null && stop?.order !== undefined && stop?.order !== ""
      ? String(stop.order)
      : mode === "create"
      ? initialOrderIndex !== null && initialOrderIndex !== undefined
        ? String(initialOrderIndex)
        : ""
      : "",
  enabled: true,
});

export default function StopModal({
  open,
  mode = "create",
  district,
  city,
  stop,
  defaultType = "pickup",
  initialOrderIndex = null,
  submitting = false,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(getInitialState(mode, stop, defaultType, initialOrderIndex));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(getInitialState(mode, stop, defaultType, initialOrderIndex));
    setError("");
  }, [open, mode, stop, defaultType, initialOrderIndex]);

  if (!open) return null;

  const submitForm = (event) => {
    event.preventDefault();
    setError("");

    const type = String(form.type || "pickup").toLowerCase();
    const offset = form.offsetMinutes === "" ? null : Number(form.offsetMinutes);
    const orderIndex = form.orderIndex === "" ? null : Number(form.orderIndex);
    const absoluteTime = String(form.absoluteTime || "").trim();

    if (!["pickup", "drop", "both"].includes(type)) {
      setError("Stop type is invalid");
      return;
    }

    if (offset !== null && (!Number.isFinite(offset) || offset < 0)) {
      setError("Offset minutes must be a non-negative number");
      return;
    }

    if (!form.enabled) {
      onSubmit({
        enabled: false,
        type,
        offsetMinutes: offset,
        absoluteTime,
        orderIndex,
      });
      return;
    }

    if (orderIndex === null || !Number.isFinite(orderIndex) || !Number.isInteger(orderIndex) || orderIndex <= 0 || orderIndex >= 9999) {
      setError("Order index must be an integer between 1 and 9998");
      return;
    }

    if (absoluteTime && !/^\d{2}:\d{2}$/.test(absoluteTime)) {
      setError("Absolute time must be in HH:mm format");
      return;
    }

    onSubmit({
      enabled: Boolean(form.enabled),
      type,
      offsetMinutes: offset,
      absoluteTime,
      orderIndex,
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
              {city?.name ? `${city.name} (${district?.name || "-"})` : "Stop details"}
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

        <form onSubmit={submitForm} className="space-y-4 px-5 py-5">
          {error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{error}</div>
          ) : null}

          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
            <p className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> City: {city?.name || "-"}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Type</label>
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
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Order Index</label>
              <input
                type="number"
                min={1}
                max={9998}
                value={form.orderIndex}
                onChange={(event) => setForm((prev) => ({ ...prev, orderIndex: event.target.value }))}
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Offset Minutes</label>
              <input
                type="number"
                min={0}
                value={form.offsetMinutes}
                onChange={(event) => setForm((prev) => ({ ...prev, offsetMinutes: event.target.value }))}
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Absolute Time (HH:mm)</label>
              <input
                value={form.absoluteTime}
                onChange={(event) => setForm((prev) => ({ ...prev, absoluteTime: event.target.value }))}
                placeholder="Optional"
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={Boolean(form.enabled)}
              onChange={(event) => setForm((prev) => ({ ...prev, enabled: event.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-blue-600"
            />
            Enabled
          </label>

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
              {submitting ? "Saving..." : mode === "edit" ? "Update Stop" : "Add Stop"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
