// Admin page for managing pickup/drop stops for a route (grouped by districts)
import { useEffect, useMemo, useState } from "react";
import {
	autoGenerateStops,
	createStop,
	deleteStop,
	getDistricts,
	getRouteStops,
	getRoutes,
	updateStop,
} from "../../services/admin.service";

const keyOf = (s) => String(s || "").trim().toLowerCase();

export default function ManageStops() {
	const [routes, setRoutes] = useState([]);
	const [districts, setDistricts] = useState([]);
	const [selectedRouteId, setSelectedRouteId] = useState("");
	const [selectedRoute, setSelectedRoute] = useState(null);
	const [activeDistrict, setActiveDistrict] = useState("");
	const [stops, setStops] = useState([]);

	const [loading, setLoading] = useState(true);
	const [actionLoading, setActionLoading] = useState(false);
	const [error, setError] = useState("");
	const [info, setInfo] = useState("");

	// Add stop form
	const [addDistrict, setAddDistrict] = useState("");
	const [addCity, setAddCity] = useState("");
	const [addType, setAddType] = useState("pickup");
	const [addOffsetMinutes, setAddOffsetMinutes] = useState("");

	const districtsByKey = useMemo(() => {
		const map = new Map();
		(districts || []).forEach((d) => {
			const name = String(d?.name || "").trim();
			if (!name) return;
			map.set(keyOf(name), d);
		});
		return map;
	}, [districts]);

	const stopByDistrictCityKey = useMemo(() => {
		const map = new Map();
		(stops || []).forEach((s) => {
			const dk = String(s?.districtKey || keyOf(s?.district)).trim();
			const ck = String(s?.cityKey || keyOf(s?.city)).trim();
			if (!dk || !ck) return;
			map.set(`${dk}|||${ck}`, s);
		});
		return map;
	}, [stops]);

	const coveredDistricts = useMemo(() => {
		return Array.isArray(selectedRoute?.districtsCovered) ? selectedRoute.districtsCovered : [];
	}, [selectedRoute]);

	const stopCountByDistrictKey = useMemo(() => {
		const map = new Map();
		(stops || []).forEach((s) => {
			const dk = String(s?.districtKey || keyOf(s?.district)).trim();
			if (!dk) return;
			map.set(dk, (map.get(dk) || 0) + 1);
		});
		return map;
	}, [stops]);

	const activeDistrictDoc = useMemo(() => {
		const name = String(activeDistrict || "").trim();
		if (!name) return null;
		return districtsByKey.get(keyOf(name)) || null;
	}, [activeDistrict, districtsByKey]);

	const activeCities = useMemo(() => {
		return Array.isArray(activeDistrictDoc?.cities) ? activeDistrictDoc.cities : [];
	}, [activeDistrictDoc]);

	const defaultTypeForDistrictIndex = (idx) => {
		if (!coveredDistricts.length) return "pickup";
		const mid = Math.floor((coveredDistricts.length - 1) / 2);
		return idx <= mid ? "pickup" : "drop";
	};

	const loadBase = async () => {
		setLoading(true);
		setError("");
		setInfo("");
		try {
			const [r, d] = await Promise.all([getRoutes(), getDistricts()]);
			setRoutes(r);
			setDistricts(d);
		} catch (err) {
			setError(err?.response?.data?.message || err.message || "Failed to load data");
		} finally {
			setLoading(false);
		}
	};

	const loadStopsForRoute = async (routeId) => {
		if (!routeId) {
			setStops([]);
			return;
		}
		setError("");
		setInfo("");
		try {
			const s = await getRouteStops(routeId);
			setStops(Array.isArray(s) ? s : []);
		} catch (err) {
			setError(err?.response?.data?.message || err.message || "Failed to load route stops");
			setStops([]);
		}
	};

	useEffect(() => {
		loadBase();
	}, []);

	useEffect(() => {
		const r = routes.find((x) => x._id === selectedRouteId) || null;
		setSelectedRoute(r);
		setActiveDistrict("");
		setStops([]);
		setAddDistrict("");
		setAddCity("");
		setAddType("pickup");
		setAddOffsetMinutes("");
		if (selectedRouteId) loadStopsForRoute(selectedRouteId);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedRouteId]);

	useEffect(() => {
		if (!coveredDistricts.length) {
			setActiveDistrict("");
			return;
		}
		const exists = coveredDistricts.some((d) => keyOf(d) === keyOf(activeDistrict));
		if (!exists) setActiveDistrict(coveredDistricts[0]);
	}, [activeDistrict, coveredDistricts]);

	const onAutoGenerate = async () => {
		if (!selectedRouteId) return;
		setActionLoading(true);
		setError("");
		setInfo("");
		try {
			const resp = await autoGenerateStops({ routeId: selectedRouteId, overwrite: false });
			if (resp?.message) setInfo(String(resp.message));
			// Reload routes (districtsCovered may have been set) + stops
			const r = await getRoutes();
			setRoutes(r);
			setSelectedRoute(r.find((x) => x._id === selectedRouteId) || null);
			await loadStopsForRoute(selectedRouteId);
		} catch (err) {
			setError(err?.response?.data?.message || err.message || "Auto-generate failed");
		} finally {
			setActionLoading(false);
		}
	};

	const onToggleCity = async ({ districtName, districtIdx, city }) => {
		if (!selectedRouteId) return;
		const dk = keyOf(districtName);
		const ck = keyOf(city);
		const existing = stopByDistrictCityKey.get(`${dk}|||${ck}`);
		setActionLoading(true);
		setError("");
		setInfo("");
		try {
			if (existing) {
				await deleteStop(existing._id);
				setStops((prev) => (Array.isArray(prev) ? prev.filter((s) => s._id !== existing._id) : []));
			} else {
				const type = defaultTypeForDistrictIndex(districtIdx);
				const created = await createStop({
					routeId: selectedRouteId,
					district: districtName,
					city,
					type,
					offsetMinutes: null,
				});
				setStops((prev) => [...(Array.isArray(prev) ? prev : []), created]);
			}
			// keep route.stops in sync (backend does this), but reload selected route so UI stop options elsewhere update
			const r = await getRoutes();
			setRoutes(r);
			setSelectedRoute(r.find((x) => x._id === selectedRouteId) || null);
		} catch (err) {
			setError(err?.response?.data?.message || err.message || "Update failed");
		} finally {
			setActionLoading(false);
		}
	};

	const onUpdateStop = async (stopId, patch) => {
		setError("");
		setInfo("");
		try {
			const updated = await updateStop(stopId, patch);
			setStops((prev) =>
				(Array.isArray(prev) ? prev : []).map((s) => (String(s._id) === String(stopId) ? { ...s, ...updated } : s))
			);
		} catch (err) {
			setError(err?.response?.data?.message || err.message || "Stop update failed");
		}
	};

	const onAddStop = async (e) => {
		e.preventDefault();
		if (!selectedRouteId) return;
		const district = String(addDistrict || "").trim();
		const city = String(addCity || "").trim();
		if (!district || !city) return;
		setActionLoading(true);
		setError("");
		setInfo("");
		try {
			const created = await createStop({
				routeId: selectedRouteId,
				district,
				city,
				type: addType,
				offsetMinutes: addOffsetMinutes === "" ? null : Number(addOffsetMinutes),
			});
			setStops((prev) => [...(Array.isArray(prev) ? prev : []), created]);
			setAddCity("");
			setAddOffsetMinutes("");

			const r = await getRoutes();
			setRoutes(r);
			setSelectedRoute(r.find((x) => x._id === selectedRouteId) || null);
		} catch (err) {
			setError(err?.response?.data?.message || err.message || "Add stop failed");
		} finally {
			setActionLoading(false);
		}
	};

	return (
		<div className="mx-auto max-w-6xl px-4 py-10">
			<div className="flex items-end justify-between gap-4">
				<div>
					<h2 className="text-2xl font-extrabold text-slate-900">Manage Stops</h2>
					<p className="mt-1 text-sm text-slate-600">Auto-generate pickup/drop points by district and customize them per route.</p>
				</div>
				<button
					type="button"
					disabled={loading || actionLoading}
					onClick={loadBase}
					className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
				>
					Refresh
				</button>
			</div>

			{error ? (
				<div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
			) : null}
			{info ? (
				<div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{info}</div>
			) : null}

			{loading ? (
				<div className="mt-6 text-sm text-slate-600">Loading...</div>
			) : (
				<>
					<div className="mt-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
						<div className="grid gap-4 lg:grid-cols-3 lg:items-end">
							<div className="lg:col-span-2">
								<label className="block text-sm font-medium text-slate-700">Route</label>
								<select
									value={selectedRouteId}
									onChange={(e) => setSelectedRouteId(e.target.value)}
									className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
								>
									<option value="">Select route</option>
									{routes.map((r) => (
										<option key={r._id} value={r._id}>
											{r.source} → {r.destination}
										</option>
									))}
								</select>
							</div>
							<div className="flex gap-3">
								<button
									type="button"
									disabled={!selectedRouteId || actionLoading}
									onClick={onAutoGenerate}
									className="inline-flex flex-1 items-center justify-center rounded-xl bg-orange-400 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-500 disabled:opacity-60"
								>
									Auto-generate stops
								</button>
							</div>
						</div>

						{selectedRoute ? (
							<div className="mt-4 text-xs text-slate-600">
								Districts covered: {coveredDistricts.length ? coveredDistricts.join(" → ") : "(not set yet; auto-generate will infer)"}
							</div>
						) : null}
					</div>

					{selectedRouteId ? (
						<div className="mt-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
							<div className="text-sm font-semibold text-slate-700">Stops by district</div>
							<p className="mt-1 text-xs text-slate-500">Click a district to manage its cities as pickup/drop points.</p>

							{coveredDistricts.length === 0 ? (
								<div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
									Auto-generate stops to infer districts along this route.
								</div>
							) : (
								<div className="mt-4 grid gap-4 lg:grid-cols-3">
									<div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
										<div className="text-xs font-semibold text-slate-600">Districts</div>
										<div className="mt-3 grid gap-2">
											{coveredDistricts.map((d) => {
												const k = keyOf(d);
												const isActive = keyOf(activeDistrict) === k;
												const count = stopCountByDistrictKey.get(k) || 0;
												return (
													<button
														key={d}
														type="button"
														onClick={() => setActiveDistrict(d)}
														className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm font-semibold shadow-sm transition ${
															isActive ? "border-orange-200 bg-orange-50 text-orange-900" : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
													}`}
													>
														<span className="truncate">{d}</span>
														<span className="shrink-0 rounded-full bg-slate-900/5 px-2 py-0.5 text-[11px] font-extrabold text-slate-600">
															{count}
														</span>
													</button>
												);
											})}
										</div>
									</div>

									<div className="lg:col-span-2 rounded-xl border border-slate-100 bg-white p-4">
										<div className="flex items-baseline justify-between gap-3">
											<div className="text-sm font-extrabold text-slate-900">{activeDistrict || "Select a district"}</div>
											<div className="text-xs text-slate-500">Tick cities and set type/offset.</div>
										</div>

										{!activeDistrict ? (
											<div className="mt-3 text-xs text-slate-500">Choose a district from the left.</div>
										) : activeCities.length === 0 ? (
											<div className="mt-3 text-xs text-slate-500">No cities found for this district in database.</div>
										) : (
											<div className="mt-4 grid gap-3 sm:grid-cols-2">
												{activeCities.map((city) => {
													const districtName = activeDistrict;
													const districtIdx = coveredDistricts.findIndex((d) => keyOf(d) === keyOf(activeDistrict));
													const stop = stopByDistrictCityKey.get(`${keyOf(districtName)}|||${keyOf(city)}`) || null;
													return (
														<div key={city} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
															<label className="inline-flex select-none items-center gap-2 text-sm font-semibold text-slate-800">
																<input
																	type="checkbox"
																	checked={Boolean(stop)}
																	onChange={() => onToggleCity({ districtName, districtIdx, city })}
																	disabled={actionLoading}
																	className="h-4 w-4 rounded border-slate-300 text-orange-500"
																/>
																{city}
															</label>

															{stop ? (
																<div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
																	<div>
																		<label className="block text-[11px] font-semibold text-slate-600">Type</label>
																		<select
																			value={stop.type || "pickup"}
																			onChange={(e) => onUpdateStop(stop._id, { type: e.target.value })}
																			className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
																		>
																			<option value="pickup">Pickup</option>
																			<option value="drop">Drop</option>
																			<option value="both">Both</option>
																		</select>
																	</div>
																	<div>
																		<label className="block text-[11px] font-semibold text-slate-600">Offset (min)</label>
																		<input
																			type="number"
																			min={0}
																			step={1}
																			value={
																				stop.offsetMinutes === null || stop.offsetMinutes === undefined || stop.offsetMinutes === ""
																					? ""
																					: String(stop.offsetMinutes)
																			}
																			onChange={(e) =>
																				onUpdateStop(stop._id, {
																					offsetMinutes: e.target.value === "" ? null : Number(e.target.value),
																				})
																			}
																			className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
																		/>
																	</div>
																	<div>
																		<label className="block text-[11px] font-semibold text-slate-600">Absolute (HH:mm)</label>
																		<input
																			type="time"
																			value={stop.absoluteTime || stop.time || ""}
																			onChange={(e) => onUpdateStop(stop._id, { absoluteTime: e.target.value })}
																			className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
																		/>
																	</div>
																</div>
															) : null}
														</div>
													);
												})}
											</div>
										)}
									</div>
								</div>
							)}

							<div className="mt-6 rounded-2xl border border-slate-100 bg-slate-50 p-5">
								<div className="text-sm font-semibold text-slate-700">Add a custom stop</div>
								<form onSubmit={onAddStop} className="mt-3 grid gap-3 sm:grid-cols-4 sm:items-end">
									<div>
										<label className="block text-[11px] font-semibold text-slate-600">District</label>
										<select
											value={addDistrict}
											onChange={(e) => setAddDistrict(e.target.value)}
											required
											className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
										>
											<option value="">Select district</option>
											{coveredDistricts.map((d) => (
												<option key={d} value={d}>
													{d}
												</option>
											))}
										</select>
									</div>
									<div>
										<label className="block text-[11px] font-semibold text-slate-600">City</label>
										<input
											value={addCity}
											onChange={(e) => setAddCity(e.target.value)}
											required
											placeholder="City/stop name"
											className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
										/>
									</div>
									<div>
										<label className="block text-[11px] font-semibold text-slate-600">Type</label>
										<select
											value={addType}
											onChange={(e) => setAddType(e.target.value)}
											className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
										>
											<option value="pickup">Pickup</option>
											<option value="drop">Drop</option>
											<option value="both">Both</option>
										</select>
									</div>
									<div>
										<label className="block text-[11px] font-semibold text-slate-600">Offset (min)</label>
										<input
											type="number"
											min={0}
											step={1}
											value={addOffsetMinutes}
											onChange={(e) => setAddOffsetMinutes(e.target.value)}
											className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
										/>
									</div>
									<div className="sm:col-span-4">
										<button
											type="submit"
											disabled={actionLoading}
											className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-60"
										>
											Add stop
										</button>
									</div>
								</form>
							</div>
						</div>
					) : null}
				</>
			)}
		</div>
	);
}
