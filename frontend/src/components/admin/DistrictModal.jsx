import { useEffect, useState } from "react";
import { Building2, X } from "lucide-react";

const getInitialState = (mode, district) => ({
  name: String(district?.name || ""),
  citiesCsv: mode === "create" ? "" : "",
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
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(getInitialState(mode, district));
    setFormError("");
  }, [open, mode, district]);

  if (!open) return null;

  const handleSubmit = (event) => {
    event.preventDefault();
    setFormError("");

    const name = String(form.name || "").trim();
    if (!name) {
      setFormError("District name is required");
      return;
    }

    if (mode === "create") {
      const cities = String(form.citiesCsv || "")
        .split(",")
        .map((city) => String(city || "").trim())
        .filter(Boolean);

      if (cities.length === 0) {
        setFormError("At least one city is required");
        return;
      }

      onSubmit({ district: name, cities });
      return;
    }

    onSubmit({ name });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 px-4">
      <div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {mode === "edit" ? "Edit District" : "Add District"}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {mode === "edit"
                ? "Update district name and keep city mapping in sync"
                : "Create a district with one or more cities"}
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

        <form onSubmit={handleSubmit} className="space-y-4 px-5 py-5">
          {formError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">
              {formError}
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
              placeholder="e.g., Kathmandu"
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            />
          </div>

          {mode === "create" ? (
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Cities (comma separated)</label>
              <input
                value={form.citiesCsv}
                onChange={(event) => setForm((prev) => ({ ...prev, citiesCsv: event.target.value }))}
                placeholder="e.g., Kalanki, Koteshwor, Gongabu"
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Duplicate city names are validated automatically.</p>
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
