import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";

const normalizeKey = (value) => String(value || "").trim().toLowerCase();
const isValidTimeHHmm = (value) => /^\d{2}:\d{2}$/.test(String(value || "").trim());

const normalizePointRows = (rows) => {
  const list = Array.isArray(rows) ? rows : [];
  const seen = new Set();

  return list
    .map((row, idx) => {
      const name = String(row?.name || "").trim();
      const time = String(row?.time || "").trim();
      const orderRaw = Number(row?.order);
      const order = Number.isFinite(orderRaw) && orderRaw > 0 ? Math.trunc(orderRaw) : idx + 1;
      return { name, time, order };
    })
    .filter((row) => {
      const key = normalizeKey(row.name);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
};

const pointsToText = (rows) => normalizePointRows(rows)
  .map((row) => `${row.name}|${row.time}${row.order ? `|${row.order}` : ""}`)
  .join("\n");

const parsePointsText = (value, laneLabel) => {
  const lines = String(value || "").split(/\r?\n/);
  const seen = new Set();
  const out = [];

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = String(lines[index] || "").trim();
    if (!rawLine) continue;

    const parts = rawLine.split("|").map((part) => String(part || "").trim());
    const [name = "", time = "", orderText = ""] = parts;

    if (!name) {
      return { ok: false, message: `${laneLabel}: name is required on line ${index + 1}` };
    }
    if (!isValidTimeHHmm(time)) {
      return { ok: false, message: `${laneLabel}: time must be HH:mm on line ${index + 1}` };
    }

    const key = normalizeKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);

    let order;
    if (orderText) {
      const parsedOrder = Number(orderText);
      if (!Number.isFinite(parsedOrder) || parsedOrder <= 0) {
        return { ok: false, message: `${laneLabel}: order must be a positive integer on line ${index + 1}` };
      }
      order = Math.trunc(parsedOrder);
    }

    out.push({
      name,
      time,
      ...(order ? { order } : {}),
    });
  }

  if (out.length === 0) {
    return { ok: true, value: [] };
  }

  return {
    ok: true,
    value: normalizePointRows(out),
  };
};

const getRoutePoints = (route, lane) => {
  const key = lane === "dropping" ? "droppingPoints" : "boardingPoints";
  const points = Array.isArray(route?.[key]) ? route[key] : [];
  if (points.length > 0) return points;

  if (lane === "boarding") {
    const source = String(route?.source || "").trim();
    return source ? [{ name: source, time: "00:00", order: 1 }] : [];
  }

  const destination = String(route?.destination || "").trim();
  return destination ? [{ name: destination, time: "00:00", order: 1 }] : [];
};

const getInitialState = (route) => {
  return {
    source: String(route?.source || ""),
    destination: String(route?.destination || ""),
    distance:
      route?.distance !== null && route?.distance !== undefined && route?.distance !== ""
        ? String(route.distance)
        : "",
    boardingPointsText: pointsToText(getRoutePoints(route, "boarding")),
    droppingPointsText: pointsToText(getRoutePoints(route, "dropping")),
  };
};

export default function RouteModal({
  open,
  mode = "create",
  route,
  cityOptions = [],
  submitting = false,
  onClose,
  onSubmit,
}) {
  const [form, setForm] = useState(getInitialState(route));
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm(getInitialState(route));
    setError("");
  }, [open, route]);

  const uniqueCityOptions = useMemo(() => {
    const set = new Set();
    const list = [];

    cityOptions.forEach((city) => {
      const name = String(city || "").trim();
      const key = normalizeKey(name);
      if (!name || !key || set.has(key)) return;
      set.add(key);
      list.push(name);
    });

    [form.source, form.destination].forEach((city) => {
      const name = String(city || "").trim();
      const key = normalizeKey(name);
      if (!name || !key || set.has(key)) return;
      set.add(key);
      list.push(name);
    });

    return list.sort((a, b) => a.localeCompare(b));
  }, [cityOptions, form.destination, form.source]);

  if (!open) return null;

  const handleSubmit = (event) => {
    event.preventDefault();
    setError("");

    const source = String(form.source || "").trim();
    const destination = String(form.destination || "").trim();
    const distance = Number(form.distance);

    if (!source || !destination) {
      setError("Source and destination are required");
      return;
    }
    if (normalizeKey(source) === normalizeKey(destination)) {
      setError("Source and destination must be different");
      return;
    }
    if (!Number.isFinite(distance) || distance <= 0) {
      setError("Distance must be greater than 0");
      return;
    }

    const boardingParsed = parsePointsText(form.boardingPointsText, "Boarding points");
    if (!boardingParsed.ok) {
      setError(boardingParsed.message);
      return;
    }

    const droppingParsed = parsePointsText(form.droppingPointsText, "Dropping points");
    if (!droppingParsed.ok) {
      setError(droppingParsed.message);
      return;
    }

    onSubmit({
      source,
      destination,
      distance,
      boardingPoints: boardingParsed.value,
      droppingPoints: droppingParsed.value,
    });
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 px-4">
      <div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {mode === "edit" ? "Edit Route" : "Create Route"}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Define route basics plus boarding and dropping lanes
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            aria-label="Close route modal"
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

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Source</label>
              <input
                value={form.source}
                onChange={(event) => setForm((prev) => ({ ...prev, source: event.target.value }))}
                list="route-city-options"
                required
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Destination</label>
              <input
                value={form.destination}
                onChange={(event) => setForm((prev) => ({ ...prev, destination: event.target.value }))}
                list="route-city-options"
                required
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Distance (km)</label>
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={form.distance}
                onChange={(event) => setForm((prev) => ({ ...prev, distance: event.target.value }))}
                required
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>

            <datalist id="route-city-options">
              {uniqueCityOptions.map((city) => (
                <option key={city} value={city} />
              ))}
            </datalist>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Boarding Points</label>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Optional. Format: Name|HH:mm|Order (order optional). Leave blank to default from source.</p>
              <textarea
                rows={8}
                value={form.boardingPointsText}
                onChange={(event) => setForm((prev) => ({ ...prev, boardingPointsText: event.target.value }))}
                placeholder="Kathmandu|06:30|1"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Dropping Points</label>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Optional. Format: Name|HH:mm|Order (order optional). Leave blank to default from destination.</p>
              <textarea
                rows={8}
                value={form.droppingPointsText}
                onChange={(event) => setForm((prev) => ({ ...prev, droppingPointsText: event.target.value }))}
                placeholder="Biratnagar|13:45|1"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
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
              {submitting ? "Saving..." : mode === "edit" ? "Save Route" : "Create Route"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
