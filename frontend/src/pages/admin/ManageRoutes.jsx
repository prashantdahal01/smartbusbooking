// Admin page for managing bus routes including stops and distances
import { useEffect, useMemo, useState } from "react";
import { createRoute, getRoutes, updateRoute } from "../../services/admin.service";

const toStopName = (raw) => {
	if (raw === null || raw === undefined) return "";
	if (typeof raw === "string") return raw;
	if (typeof raw === "object") return raw.name;
	return "";
};

const toStopKmFromSource = (raw) => {
	if (!raw || typeof raw !== "object") return "";
	const v = raw.kmFromSource ?? raw.distanceFromSourceKm ?? raw.km;
	if (v === null || v === undefined || v === "") return "";
	const n = Number(v);
	return Number.isFinite(n) ? String(n) : "";
};

const normalizeStopRows = (rows) => {
	const arr = Array.isArray(rows) ? rows : [];
	const seen = new Set();
	const out = [];
	arr.forEach((r) => {
		const name = String(r?.name || "").trim();
		if (!name) return;
		const key = name.toLowerCase();
		if (seen.has(key)) return;
		seen.add(key);
		const kmRaw = r?.kmFromSource;
		const kmNum = kmRaw !== undefined && kmRaw !== null && kmRaw !== "" ? Number(kmRaw) : undefined;
		const stop = { name };
		if (Number.isFinite(kmNum)) stop.kmFromSource = kmNum;
		out.push(stop);
	});
	return out;
};

export default function ManageRoutes() {
	const [routes, setRoutes] = useState([]);
	const [source, setSource] = useState("");
	const [destination, setDestination] = useState("");
	const [distance, setDistance] = useState(0);
	const [stops, setStops] = useState([]);
	const [editingId, setEditingId] = useState(null);
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(true);
	const [actionLoading, setActionLoading] = useState(false);

	const isEditing = useMemo(() => Boolean(editingId), [editingId]);

	const resetForm = () => {
		setSource("");
		setDestination("");
		setDistance(0);
		setStops([]);
		setEditingId(null);
	};

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const data = await getRoutes();
			setRoutes(data);
		} catch (err) {
			setError(err?.response?.data?.message || err.message || "Failed to load routes");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const onSubmit = async (e) => {
		e.preventDefault();
		setError("");
		setActionLoading(true);
		try {
			const payload = {
				source,
				destination,
				distance: Number(distance),
				stops: normalizeStopRows(stops),
			};
			if (isEditing) {
				await updateRoute(editingId, payload);
			} else {
				await createRoute(payload);
			}
			resetForm();
			await load();
		} catch (err) {
			setError(err?.response?.data?.message || err.message || (isEditing ? "Update failed" : "Create failed"));
		} finally {
			setActionLoading(false);
		}
	};

	const onEdit = (route) => {
		setEditingId(route._id);
		setSource(route.source || "");
		setDestination(route.destination || "");
		setDistance(route.distance || 0);
		const rawStops = Array.isArray(route.stops) ? route.stops : [];
		setStops(
			rawStops
				.map((s) => ({
					name: String(toStopName(s) || "").trim(),
					kmFromSource: toStopKmFromSource(s),
				}))
				.filter((s) => s.name)
		);
	};

	return (
		<div className="mx-auto max-w-6xl px-4 py-10">
			<div className="flex items-end justify-between gap-4">
				<div>
					<h2 className="text-2xl font-extrabold text-slate-900">Manage Routes</h2>
					<p className="mt-1 text-sm text-slate-600">Add routes and define stop lists so booking pages can show full trip details.</p>
				</div>
			</div>

			{error ? (
				<div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
			) : null}

			<div className="mt-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
				<form onSubmit={onSubmit} className="grid gap-4 lg:grid-cols-4 lg:items-end">
					<div>
						<label className="block text-sm font-medium text-slate-700">Source</label>
						<input
							value={source}
							onChange={(e) => setSource(e.target.value)}
							required
							placeholder="e.g., Delhi"
							className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-slate-700">Destination</label>
						<input
							value={destination}
							onChange={(e) => setDestination(e.target.value)}
							required
							placeholder="e.g., Jaipur"
							className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-slate-700">Distance (km)</label>
						<input
							type="number"
							min={1}
							value={distance}
							onChange={(e) => setDistance(e.target.value)}
							required
							className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
						/>
					</div>
					<div className="flex gap-3">
						<button
							type="submit"
							disabled={actionLoading}
							className="inline-flex flex-1 items-center justify-center rounded-xl bg-orange-400 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 disabled:opacity-60"
						>
							{isEditing ? "Save" : "Add route"}
						</button>
						{isEditing ? (
							<button
								type="button"
								disabled={actionLoading}
								onClick={resetForm}
								className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
							>
								Cancel
							</button>
						) : null}
					</div>

					<div className="lg:col-span-4">
						<label className="block text-sm font-medium text-slate-700">Stops (optional)</label>
						<div className="mt-2 space-y-3 rounded-xl border border-slate-200 bg-white p-3">
							{stops.length === 0 ? (
								<div className="text-xs text-slate-500">No intermediate stops added.</div>
							) : (
								<div className="space-y-2">
									{stops.map((s, idx) => (
										<div key={`${idx}-${s?.name || "stop"}`} className="grid gap-3 sm:grid-cols-3">
											<div className="sm:col-span-2">
												<label className="block text-[11px] font-semibold text-slate-600">Stop name</label>
												<input
													value={s?.name || ""}
													onChange={(e) =>
														setStops((prev) =>
															(prev || []).map((row, i) => (i === idx ? { ...row, name: e.target.value } : row))
														)
													}
													placeholder="e.g., Gurugram"
													className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
												/>
											</div>
											<div>
												<label className="block text-[11px] font-semibold text-slate-600">Km from source</label>
												<input
													type="number"
													min={0}
													step={0.1}
													value={s?.kmFromSource ?? ""}
													onChange={(e) =>
														setStops((prev) =>
															(prev || []).map((row, i) => (i === idx ? { ...row, kmFromSource: e.target.value } : row))
														)
													}
													placeholder="e.g., 35"
													className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
												/>
											</div>
											<div className="sm:col-span-3">
												<button
													type="button"
													onClick={() => setStops((prev) => (prev || []).filter((_, i) => i !== idx))}
													className="text-xs font-semibold text-red-700 hover:underline"
												>
													Remove stop
												</button>
											</div>
										</div>
									))}
								</div>
							)}

							<div className="flex items-center justify-between gap-3">
								<button
									type="button"
									onClick={() => setStops((prev) => [...(Array.isArray(prev) ? prev : []), { name: "", kmFromSource: "" }])}
								className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
							>
								Add stop
							</button>
							<p className="text-xs text-slate-500">Tip: Set km-from-source to auto-calculate schedule times.</p>
						</div>
					</div>
					</div>
				</form>
			</div>

			<div className="mt-8">
				{loading ? <div className="text-sm text-slate-600">Loading...</div> : null}
				<div className="mt-4 grid gap-4 sm:grid-cols-2">
					{routes.map((r) => (
						<div key={r._id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
							<div className="flex items-start justify-between gap-3">
								<div>
									<div className="text-base font-extrabold text-slate-900">{r.source} → {r.destination}</div>
									<div className="mt-1 text-sm text-slate-600">Distance: {r.distance} km</div>
								</div>
								<button
									type="button"
									onClick={() => onEdit(r)}
									className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
								>
									Edit
								</button>
							</div>

							{Array.isArray(r.stops) && r.stops.length > 0 ? (
								<div className="mt-4">
									<div className="text-xs font-semibold text-slate-700">Stops</div>
									<div className="mt-2 flex flex-wrap gap-2 text-xs">
										{r.stops
											.map((s) => {
												const name = String(toStopName(s) || "").trim();
												const km = toStopKmFromSource(s);
												return { name, km };
											})
											.filter((s) => s.name)
											.map((s) => (
												<span key={s.name} className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-700">
													{s.name}{s.km !== "" ? ` (${s.km} km)` : ""}
												</span>
											))}
									</div>
								</div>
							) : (
								<div className="mt-4 text-xs text-slate-500">No stops set.</div>
							)}
						</div>
					))}
					{routes.length === 0 && !loading ? <div className="text-sm text-slate-600">No routes.</div> : null}
				</div>
			</div>
		</div>
	);
}
