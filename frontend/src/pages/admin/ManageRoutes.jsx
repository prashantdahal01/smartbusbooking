import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Plus, RefreshCw, Search } from "lucide-react";
import RouteDetailPanel from "../../components/admin/routes/RouteDetailPanel";
import RouteList from "../../components/admin/routes/RouteList";
import RouteModal from "../../components/admin/routes/RouteModal";
import ConfirmDialog from "../../components/admin/routes/ConfirmDialog";
import {
	createRoute,
	deleteRoute,
	getDistricts,
	getRouteStops,
	getRoutes,
	updateRoute,
} from "../../services/admin.service";

const PAGE_SIZE = 8;

const normalizeKey = (value) => String(value || "").trim().toLowerCase();

const toStopName = (raw) => {
	if (raw === null || raw === undefined) return "";
	if (typeof raw === "string") return raw;
	if (typeof raw === "object") return raw.name;
	return "";
};

const toStopKmFromSource = (raw) => {
	if (!raw || typeof raw !== "object") return null;
	const value = raw.kmFromSource ?? raw.distanceFromSourceKm ?? raw.km;
	if (value === null || value === undefined || value === "") return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
};

const mergeStopType = (leftType, rightType) => {
	const left = String(leftType || "pickup").toLowerCase();
	const right = String(rightType || "pickup").toLowerCase();
	if (left === right) return left;
	if (left === "both" || right === "both") return "both";
	return "both";
};

const normalizeLanePoints = (points, type) =>
	(Array.isArray(points) ? points : [])
		.map((point, idx) => {
			const name = String(point?.name || "").trim();
			const orderRaw = Number(point?.order);
			const order = Number.isFinite(orderRaw) && orderRaw > 0 ? Math.trunc(orderRaw) : idx + 1;
			return { name, order, type };
		})
		.filter((point) => point.name);

const normalizeRouteStopsFromRoute = (route) => {
	const rawStops = Array.isArray(route?.stops) ? route.stops : [];
	const legacyStopRows = rawStops
		.map((stop, idx) => {
			const name = String(toStopName(stop) || "").trim();
			const orderRaw = Number(stop?.order);
			const order = Number.isFinite(orderRaw) && orderRaw > 0 ? Math.trunc(orderRaw) : idx + 1;
			return {
				name,
				order,
				kmFromSource: toStopKmFromSource(stop),
				type: "pickup",
			};
		})
		.filter((stop) => stop.name);

	const legacyKmByKey = new Map();
	legacyStopRows.forEach((stop) => {
		const key = normalizeKey(stop.name);
		if (!key || legacyKmByKey.has(key)) return;
		legacyKmByKey.set(key, stop.kmFromSource);
	});

	const laneRows = [
		...normalizeLanePoints(route?.boardingPoints, "pickup"),
		...normalizeLanePoints(route?.droppingPoints, "drop"),
	];

	if (laneRows.length > 0) {
		const byKey = new Map();

		laneRows.forEach((row) => {
			const key = normalizeKey(row?.name);
			if (!key) return;

			if (!byKey.has(key)) {
				byKey.set(key, {
					name: row.name,
					order: row.order,
					type: row.type,
					kmFromSource: legacyKmByKey.get(key) ?? null,
				});
				return;
			}

			const existing = byKey.get(key);
			existing.type = mergeStopType(existing.type, row.type);
			if (Number.isFinite(Number(row.order)) && Number(row.order) > 0 && Number(row.order) < Number(existing.order || Number.MAX_SAFE_INTEGER)) {
				existing.order = Math.trunc(Number(row.order));
			}
		});

		return Array.from(byKey.values()).sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
	}

	return legacyStopRows;
};

const validateRoutePayload = (payload) => {
	const source = String(payload?.source || "").trim();
	const destination = String(payload?.destination || "").trim();
	const distance = Number(payload?.distance);

	if (!source || !destination) return "Source and destination are required";
	if (normalizeKey(source) === normalizeKey(destination)) {
		return "Source and destination must be different";
	}
	if (!Number.isFinite(distance) || distance <= 0) {
		return "Distance must be greater than 0";
	}

	return "";
};

const createToast = (type, message) => ({
	id: Date.now(),
	type,
	message,
});

export default function ManageRoutes() {
	const [routes, setRoutes] = useState([]);
	const [districts, setDistricts] = useState([]);
	const [operationalStops, setOperationalStops] = useState([]);

	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [stopsLoading, setStopsLoading] = useState(false);

	const [error, setError] = useState("");
	const [toast, setToast] = useState(null);

	const [searchText, setSearchText] = useState("");
	const [searchQuery, setSearchQuery] = useState("");
	const [sourceFilter, setSourceFilter] = useState("all");
	const [destinationFilter, setDestinationFilter] = useState("all");
	const [page, setPage] = useState(1);

	const [selectedRouteId, setSelectedRouteId] = useState("");

	const [routeModalState, setRouteModalState] = useState({
		open: false,
		mode: "create",
		route: null,
	});
	const [routeSubmitting, setRouteSubmitting] = useState(false);

	const [confirmState, setConfirmState] = useState({
		open: false,
		route: null,
	});
	const [confirmLoading, setConfirmLoading] = useState(false);

	const loadData = useCallback(async ({ silent = false } = {}) => {
		if (silent) setRefreshing(true);
		else setLoading(true);

		setError("");
		try {
			const [routeData, districtData] = await Promise.all([getRoutes(), getDistricts()]);
			setRoutes(Array.isArray(routeData) ? routeData : []);
			setDistricts(Array.isArray(districtData) ? districtData : []);
		} catch (err) {
			setError(err?.response?.data?.message || err?.message || "Failed to load routes");
		} finally {
			if (silent) setRefreshing(false);
			else setLoading(false);
		}
	}, []);

	const loadOperationalStops = useCallback(async (routeId) => {
		if (!routeId) {
			setOperationalStops([]);
			return;
		}

		setStopsLoading(true);
		try {
			const data = await getRouteStops(routeId);
			setOperationalStops(Array.isArray(data) ? data : []);
		} catch (err) {
			setOperationalStops([]);
			setError(err?.response?.data?.message || err?.message || "Failed to load route stops");
		} finally {
			setStopsLoading(false);
		}
	}, []);

	useEffect(() => {
		loadData();
	}, [loadData]);

	useEffect(() => {
		if (routes.length === 0) {
			setSelectedRouteId("");
			return;
		}

		const exists = routes.some((route) => String(route._id) === String(selectedRouteId));
		if (!exists) {
			setSelectedRouteId(String(routes[0]._id));
		}
	}, [routes, selectedRouteId]);

	useEffect(() => {
		const timer = setTimeout(() => {
			setSearchQuery(String(searchText || "").trim().toLowerCase());
		}, 260);
		return () => clearTimeout(timer);
	}, [searchText]);

	useEffect(() => {
		setPage(1);
	}, [searchQuery, sourceFilter, destinationFilter]);

	useEffect(() => {
		loadOperationalStops(selectedRouteId);
	}, [loadOperationalStops, selectedRouteId]);

	useEffect(() => {
		if (!toast) return undefined;
		const timer = setTimeout(() => setToast(null), 3200);
		return () => clearTimeout(timer);
	}, [toast]);

	const cityOptions = useMemo(() => {
		const seen = new Set();
		const list = [];

		(districts || []).forEach((district) => {
			const cities = Array.isArray(district?.cities) ? district.cities : [];
			cities.forEach((city) => {
				const name = String(city || "").trim();
				const key = normalizeKey(name);
				if (!name || !key || seen.has(key)) return;
				seen.add(key);
				list.push(name);
			});
		});

		return list.sort((a, b) => a.localeCompare(b));
	}, [districts]);

	const sourceOptions = useMemo(() => {
		const values = new Set();
		routes.forEach((route) => {
			const source = String(route?.source || "").trim();
			if (source) values.add(source);
		});
		return Array.from(values).sort((a, b) => a.localeCompare(b));
	}, [routes]);

	const destinationOptions = useMemo(() => {
		const values = new Set();
		routes.forEach((route) => {
			const destination = String(route?.destination || "").trim();
			if (destination) values.add(destination);
		});
		return Array.from(values).sort((a, b) => a.localeCompare(b));
	}, [routes]);

	const filteredRoutes = useMemo(() => {
		return routes.filter((route) => {
			const source = String(route?.source || "").trim();
			const destination = String(route?.destination || "").trim();
			const routeStops = normalizeRouteStopsFromRoute(route);

			if (sourceFilter !== "all" && normalizeKey(sourceFilter) !== normalizeKey(source)) return false;
			if (destinationFilter !== "all" && normalizeKey(destinationFilter) !== normalizeKey(destination)) return false;

			if (!searchQuery) return true;

			const haystack = `${source} ${destination} ${routeStops.map((stop) => stop.name).join(" ")}`.toLowerCase();
			return haystack.includes(searchQuery);
		});
	}, [routes, searchQuery, sourceFilter, destinationFilter]);

	const totalPages = Math.max(1, Math.ceil(filteredRoutes.length / PAGE_SIZE));

	useEffect(() => {
		if (page > totalPages) {
			setPage(totalPages);
		}
	}, [page, totalPages]);

	const pagedRoutes = useMemo(() => {
		const start = (page - 1) * PAGE_SIZE;
		return filteredRoutes.slice(start, start + PAGE_SIZE);
	}, [filteredRoutes, page]);

	const selectedRoute = useMemo(
		() => routes.find((route) => String(route._id) === String(selectedRouteId)) || null,
		[routes, selectedRouteId]
	);

	const selectedRouteStops = useMemo(() => {
		if (!selectedRoute) return [];

		if (Array.isArray(operationalStops) && operationalStops.length > 0) {
			return operationalStops
				.map((stop, index) => {
					const name = String(stop?.cityName || stop?.city?.name || stop?.city || "").trim();
					if (!name) return null;

					const orderRaw = Number(stop?.order);
					const order = Number.isFinite(orderRaw) && Number.isInteger(orderRaw) && orderRaw > 0 ? orderRaw : index + 1;

					return {
						name,
						order,
						type: String(stop?.type || "pickup").toLowerCase(),
						offsetMinutes:
							stop?.offsetMinutes !== undefined && stop?.offsetMinutes !== null ? Number(stop.offsetMinutes) : "",
						absoluteTime: String(stop?.absoluteTime || ""),
					};
				})
				.filter(Boolean)
				.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
		}

		return normalizeRouteStopsFromRoute(selectedRoute).map((stop, index) => ({
			name: stop.name,
			order: Number.isFinite(Number(stop?.order)) && Number(stop.order) > 0
				? Math.trunc(Number(stop.order))
				: stop.kmFromSource !== null && stop.kmFromSource !== undefined
					? Number(stop.kmFromSource)
					: index + 1,
			type: String(stop?.type || "pickup").toLowerCase(),
			offsetMinutes: "",
			absoluteTime: "",
		}));
	}, [selectedRoute, operationalStops]);

	const openCreateRouteModal = () => {
		setRouteModalState({ open: true, mode: "create", route: null });
	};

	const openEditRouteModal = (route) => {
		setRouteModalState({ open: true, mode: "edit", route });
	};

	const closeRouteModal = () => {
		if (routeSubmitting) return;
		setRouteModalState({ open: false, mode: "create", route: null });
	};

	const handleRouteSubmit = async (payload) => {
		const validationMessage = validateRoutePayload(payload);
		if (validationMessage) {
			setError(validationMessage);
			setToast(createToast("error", validationMessage));
			return;
		}

		setRouteSubmitting(true);
		setError("");

		try {
			if (routeModalState.mode === "edit" && routeModalState.route?._id) {
				await updateRoute(routeModalState.route._id, payload);
				setToast(createToast("success", "Route updated successfully"));
				setSelectedRouteId(String(routeModalState.route._id));
			} else {
				const created = await createRoute(payload);
				setToast(createToast("success", "Route created successfully"));
				if (created?._id) {
					setSelectedRouteId(String(created._id));
				}
			}

			setRouteModalState({ open: false, mode: "create", route: null });
			await loadData({ silent: true });
		} catch (err) {
			const message = err?.response?.data?.message || err?.message || "Failed to save route";
			setError(message);
			setToast(createToast("error", message));
		} finally {
			setRouteSubmitting(false);
		}
	};

	const requestDeleteRoute = (route) => {
		setConfirmState({ open: true, route });
	};

	const closeConfirm = (force = false) => {
		if (confirmLoading && !force) return;
		setConfirmState({ open: false, route: null });
	};

	const confirmDelete = async () => {
		if (!confirmState.open) return;

		setConfirmLoading(true);
		setError("");

		try {
			if (confirmState.route?._id) {
				await deleteRoute(confirmState.route._id);
				setToast(createToast("success", "Route deleted"));
				if (String(selectedRouteId) === String(confirmState.route._id)) {
					setSelectedRouteId("");
					setOperationalStops([]);
				}
				closeConfirm(true);
				await loadData({ silent: true });
			}
		} catch (err) {
			const message = err?.response?.data?.message || err?.message || "Delete action failed";
			setError(message);
			setToast(createToast("error", message));
		} finally {
			setConfirmLoading(false);
		}
	};

	const totalStart = filteredRoutes.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
	const totalEnd = Math.min(page * PAGE_SIZE, filteredRoutes.length);

	return (
		<div className="space-y-5">
			{toast ? (
				<div
					className={`fixed right-4 top-24 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg ${
						toast.type === "success" ? "bg-emerald-600" : "bg-rose-600"
					}`}
				>
					{toast.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
					{toast.message}
				</div>
			) : null}

			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Route Management</h2>
					<p className="text-sm text-slate-500 dark:text-slate-400">
						Create and update route basics. Manage stops in Stop Management.
					</p>
				</div>
				<button
					type="button"
					onClick={openCreateRouteModal}
					className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
				>
					<Plus className="h-4 w-4" />
					Add Route
				</button>
			</div>

			<section className="admin-surface p-4 sm:p-5">
				<div className="grid gap-3 md:grid-cols-4">
					<div className="relative md:col-span-2">
						<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
						<input
							value={searchText}
							onChange={(event) => setSearchText(event.target.value)}
							placeholder="Search routes"
							className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
						/>
					</div>

					<select
						value={sourceFilter}
						onChange={(event) => setSourceFilter(event.target.value)}
						className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
					>
						<option value="all">All sources</option>
						{sourceOptions.map((source) => (
							<option key={source} value={source}>
								{source}
							</option>
						))}
					</select>

					<div className="flex gap-2">
						<select
							value={destinationFilter}
							onChange={(event) => setDestinationFilter(event.target.value)}
							className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
						>
							<option value="all">All destinations</option>
							{destinationOptions.map((destination) => (
								<option key={destination} value={destination}>
									{destination}
								</option>
							))}
						</select>

						<button
							type="button"
							onClick={() => loadData({ silent: true })}
							disabled={refreshing}
							className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
						>
							<RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
							Refresh
						</button>
					</div>
				</div>
			</section>

			{error ? (
				<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
					{error}
				</div>
			) : null}

			<section className="grid gap-5 xl:grid-cols-[360px_1fr]">
				<div className="space-y-3">
					<RouteList
						routes={pagedRoutes}
						loading={loading}
						selectedRouteId={selectedRouteId}
						onSelect={(route) => setSelectedRouteId(String(route._id))}
						onEdit={openEditRouteModal}
						onDelete={requestDeleteRoute}
						disableActions={routeSubmitting || confirmLoading}
					/>

					{!loading && filteredRoutes.length > 0 ? (
						<div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900">
							<div className="flex items-center justify-between gap-2">
								<p className="text-slate-500 dark:text-slate-400">
									Showing {totalStart}-{totalEnd} of {filteredRoutes.length}
								</p>
								<div className="flex items-center gap-2">
									<button
										type="button"
										disabled={page <= 1}
										onClick={() => setPage((prev) => Math.max(1, prev - 1))}
										className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
									>
										Prev
									</button>
									<span className="text-slate-600 dark:text-slate-300">
										{page}/{totalPages}
									</span>
									<button
										type="button"
										disabled={page >= totalPages}
										onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
										className="rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
									>
										Next
									</button>
								</div>
							</div>
						</div>
					) : null}
				</div>

				<RouteDetailPanel
					route={selectedRoute}
					loadingStops={stopsLoading}
					stops={selectedRouteStops}
				/>
			</section>

			<RouteModal
				open={routeModalState.open}
				mode={routeModalState.mode}
				route={routeModalState.route}
				cityOptions={cityOptions}
				submitting={routeSubmitting}
				onClose={closeRouteModal}
				onSubmit={handleRouteSubmit}
			/>

			<ConfirmDialog
				open={confirmState.open}
				title="Delete Route?"
				message={`Are you sure you want to delete route "${confirmState.route?.source || ""} to ${
					confirmState.route?.destination || ""
				}"?`}
				confirmLabel="Delete Route"
				cancelLabel="Cancel"
				loading={confirmLoading}
				onCancel={closeConfirm}
				onConfirm={confirmDelete}
			/>
		</div>
	);
}
