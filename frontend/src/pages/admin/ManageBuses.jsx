import { useCallback, useEffect, useMemo, useState } from "react";
import {
	BusFront,
	CheckCircle2,
	CircleAlert,
	Copy,
	Pencil,
	Plus,
	RefreshCw,
	Search,
	Trash2,
} from "lucide-react";
import BusModal from "../../components/admin/BusModal";
import ConfirmDialog from "../../components/admin/ConfirmDialog";
import { createBus, deleteBus, getBuses, updateBus } from "../../services/admin.service";
import { BUS_TYPE_OPTIONS, getBusTypeLabels, getBusTypesFromBus, isSleeperBusType } from "../../utils/busTypeUtils";
import { toAbsoluteAssetUrl } from "../../utils/helpers";

const PAGE_SIZE = 6;

const TYPE_OPTIONS = [
	{ value: "all", label: "All bus types" },
	...BUS_TYPE_OPTIONS,
];

const getTypeBadgeClass = (type) => {
	if (type === "AC") return "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300";
	if (isSleeperBusType(type)) return "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300";
	if (type === "SOFA_SEATER") return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300";
	return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
};

const getOperatorText = (operator) => {
	if (!operator) return "Unassigned";
	if (typeof operator === "string") return operator;
	return operator.name || operator.email || operator._id || "Unassigned";
};

const getStatus = (bus) => {
	if (typeof bus?.isActive === "boolean") {
		return bus.isActive
			? { label: "Active", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" }
			: { label: "Inactive", className: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300" };
	}

	return {
		label: "Active",
		className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
	};
};

export default function ManageBuses() {
	const [buses, setBuses] = useState([]);
	const [loading, setLoading] = useState(true);
	const [refreshing, setRefreshing] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState(null);

	const [searchText, setSearchText] = useState("");
	const [searchQuery, setSearchQuery] = useState("");
	const [typeFilter, setTypeFilter] = useState("all");
	const [page, setPage] = useState(1);

	const [busModalOpen, setBusModalOpen] = useState(false);
	const [modalMode, setModalMode] = useState("create");
	const [modalBus, setModalBus] = useState(null);
	const [submitting, setSubmitting] = useState(false);

	const [deletingBus, setDeletingBus] = useState(null);
	const [deleting, setDeleting] = useState(false);

	const showNotice = (type, message) => {
		setNotice({ type, message, id: Date.now() });
	};

	const loadBuses = useCallback(async ({ silent = false } = {}) => {
		if (silent) setRefreshing(true);
		else setLoading(true);

		setError("");
		try {
			const data = await getBuses();
			setBuses(Array.isArray(data) ? data : []);
		} catch (err) {
			const message = err?.response?.data?.message || err?.message || "Failed to load buses";
			setError(message);
		} finally {
			if (silent) setRefreshing(false);
			else setLoading(false);
		}
	}, []);

	useEffect(() => {
		loadBuses();
	}, [loadBuses]);

	useEffect(() => {
		const timer = setTimeout(() => {
			setSearchQuery(String(searchText || "").trim().toLowerCase());
		}, 260);

		return () => clearTimeout(timer);
	}, [searchText]);

	useEffect(() => {
		setPage(1);
	}, [searchQuery, typeFilter]);

	useEffect(() => {
		if (!notice) return undefined;
		const timer = setTimeout(() => setNotice(null), 3200);
		return () => clearTimeout(timer);
	}, [notice]);

	const stats = useMemo(() => {
		let acEnabled = 0;
		let sleeperReady = 0;
		let sofaSeater = 0;

		buses.forEach((bus) => {
			const busTypes = getBusTypesFromBus(bus);
			if (busTypes.includes("AC")) acEnabled += 1;
			if (busTypes.some((type) => isSleeperBusType(type))) sleeperReady += 1;
			if (busTypes.includes("SOFA_SEATER")) sofaSeater += 1;
		});

		return {
			total: buses.length,
			acEnabled,
			sleeperReady,
			sofaSeater,
		};
	}, [buses]);

	const filteredBuses = useMemo(() => {
		return buses.filter((bus) => {
			const busTypes = getBusTypesFromBus(bus);
			const matchesFilter = typeFilter === "all" ? true : busTypes.includes(typeFilter);

			if (!matchesFilter) return false;
			if (!searchQuery) return true;

			const haystack = `${bus?.name || ""} ${bus?.vehicleNumber || ""} ${getOperatorText(bus?.operator)} ${getBusTypeLabels(bus).join(" ")}`.toLowerCase();
			return haystack.includes(searchQuery);
		});
	}, [buses, searchQuery, typeFilter]);

	const totalPages = Math.max(1, Math.ceil(filteredBuses.length / PAGE_SIZE));

	useEffect(() => {
		if (page > totalPages) {
			setPage(totalPages);
		}
	}, [page, totalPages]);

	const currentRows = useMemo(() => {
		const start = (page - 1) * PAGE_SIZE;
		return filteredBuses.slice(start, start + PAGE_SIZE);
	}, [filteredBuses, page]);

	const pageStart = filteredBuses.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
	const pageEnd = Math.min(page * PAGE_SIZE, filteredBuses.length);

	const openCreateModal = () => {
		setModalMode("create");
		setModalBus(null);
		setBusModalOpen(true);
	};

	const openEditModal = (bus) => {
		setModalMode("edit");
		setModalBus(bus);
		setBusModalOpen(true);
	};

	const openDuplicateModal = (bus) => {
		setModalMode("create");
		setModalBus({
			...bus,
			name: `${String(bus?.name || "Bus").trim()} Copy`,
			vehicleNumber: "",
			operator: typeof bus?.operator === "object" ? bus?.operator?._id || "" : bus?.operator || "",
		});
		setBusModalOpen(true);
	};

	const handleBusSubmit = async (payload) => {
		setSubmitting(true);
		setError("");

		try {
			if (modalMode === "edit" && modalBus?._id) {
				await updateBus(modalBus._id, payload);
				showNotice("success", "Bus updated successfully");
			} else {
				await createBus(payload);
				showNotice("success", "Bus created successfully");
			}

			setBusModalOpen(false);
			setModalMode("create");
			setModalBus(null);
			await loadBuses({ silent: true });
		} catch (err) {
			const message = err?.response?.data?.message || err?.message || "Failed to save bus";
			setError(message);
			showNotice("error", message);
		} finally {
			setSubmitting(false);
		}
	};

	const confirmDeleteBus = async () => {
		if (!deletingBus?._id) return;

		setDeleting(true);
		setError("");

		try {
			await deleteBus(deletingBus._id);
			showNotice("success", `Bus "${deletingBus.name}" deleted`);
			setDeletingBus(null);
			await loadBuses({ silent: true });
		} catch (err) {
			const message = err?.response?.data?.message || err?.message || "Failed to delete bus";
			setError(message);
			showNotice("error", message);
		} finally {
			setDeleting(false);
		}
	};

	const statCards = [
		{ label: "Total Buses", value: stats.total },
		{ label: "AC Equipped", value: stats.acEnabled },
		{ label: "Sleeper Ready", value: stats.sleeperReady },
		{ label: "Sofa Seater", value: stats.sofaSeater },
	];

	return (
		<div className="space-y-5">
			{notice ? (
				<div
					className={`fixed right-4 top-24 z-50 flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold shadow-lg ${
						notice.type === "success"
							? "bg-emerald-600 text-white"
							: "bg-rose-600 text-white"
					}`}
				>
					{notice.type === "success" ? <CheckCircle2 className="h-4 w-4" /> : <CircleAlert className="h-4 w-4" />}
					{notice.message}
				</div>
			) : null}

			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Bus Management</h2>
					<p className="text-sm text-slate-500 dark:text-slate-400">
						Create, update, and maintain buses used in booking operations
					</p>
				</div>

				<button
					type="button"
					onClick={openCreateModal}
					className="inline-flex h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
				>
					<Plus className="h-4 w-4" />
					Add Bus
				</button>
			</div>

			<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
				{statCards.map((card) => (
					<article key={card.label} className="admin-surface p-5">
						<div className="flex items-start justify-between gap-3">
							<div>
								<p className="text-sm font-medium text-slate-500 dark:text-slate-400">{card.label}</p>
								<p className="mt-2 text-3xl font-bold text-slate-900 dark:text-slate-100">{card.value}</p>
							</div>
							<div className="grid h-11 w-11 place-items-center rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300">
								<BusFront className="h-5 w-5" />
							</div>
						</div>
					</article>
				))}
			</section>

			<section className="admin-surface p-4 sm:p-5">
				<div className="flex flex-wrap items-center gap-3">
					<div className="relative min-w-72 flex-1">
						<Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
						<input
							value={searchText}
							onChange={(event) => setSearchText(event.target.value)}
							placeholder="Search by bus name, vehicle number, operator"
							className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
						/>
					</div>

					<select
						value={typeFilter}
						onChange={(event) => setTypeFilter(event.target.value)}
						className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
					>
						{TYPE_OPTIONS.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>

					<button
						type="button"
						onClick={() => loadBuses({ silent: true })}
						disabled={refreshing}
						className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
					>
						<RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
						Refresh
					</button>
				</div>
			</section>

			{error ? (
				<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-900/30 dark:text-rose-300">
					{error}
				</div>
			) : null}

			<section>
				{loading ? (
					<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
						{Array.from({ length: PAGE_SIZE }).map((_, index) => (
							<div key={`bus-skeleton-${index}`} className="admin-surface overflow-hidden">
								<div className="skeleton h-40 w-full rounded-none" />
								<div className="space-y-2 p-4">
									<div className="skeleton h-5 w-2/3" />
									<div className="skeleton h-4 w-1/2" />
									<div className="skeleton h-4 w-3/4" />
									<div className="skeleton h-9 w-full" />
								</div>
							</div>
						))}
					</div>
				) : currentRows.length === 0 ? (
					<div className="admin-surface grid place-items-center p-10 text-center">
						<div className="grid h-14 w-14 place-items-center rounded-full bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300">
							<BusFront className="h-7 w-7" />
						</div>
						<h3 className="mt-4 text-lg font-semibold text-slate-900 dark:text-slate-100">No buses found</h3>
						<p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
							Try changing your search/filter or add a new bus.
						</p>
						<button
							type="button"
							onClick={openCreateModal}
							className="mt-4 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
						>
							<Plus className="h-4 w-4" />
							Add Bus
						</button>
					</div>
				) : (
					<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
						{currentRows.map((bus) => {
							const status = getStatus(bus);
							const busTypes = getBusTypesFromBus(bus);
							const typeLabels = getBusTypeLabels(bus);
							return (
								<article key={bus._id} className="admin-surface overflow-hidden">
									<div className="aspect-video w-full bg-slate-100 dark:bg-slate-800">
										{bus.imageUrl ? (
											<img
												src={toAbsoluteAssetUrl(bus.imageUrl)}
												alt={bus.name}
												className="h-full w-full object-cover"
											/>
										) : (
											<div className="grid h-full place-items-center text-sm text-slate-500 dark:text-slate-400">
												No image
											</div>
										)}
									</div>

									<div className="p-4">
										<div className="flex items-start justify-between gap-3">
											<h3 className="line-clamp-1 text-base font-bold text-slate-900 dark:text-slate-100">{bus.name}</h3>
											<span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${status.className}`}>
												{status.label}
											</span>
										</div>

										<p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
											{bus.vehicleNumber || "Vehicle number not set"}
										</p>

										<div className="mt-3 flex flex-wrap gap-2 text-xs">
											{busTypes.slice(0, 3).map((type, idx) => (
												<span key={`${bus._id}-type-${type}-${idx}`} className={`rounded-full px-2.5 py-1 font-semibold ${getTypeBadgeClass(type)}`}>
													{typeLabels[idx] || type}
												</span>
											))}
											{busTypes.length > 3 ? (
												<span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
													+{busTypes.length - 3} more
												</span>
											) : null}
											<span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
												{Number(bus.totalSeats) || 0} seats
											</span>
										</div>

										<p className="mt-3 line-clamp-1 text-xs text-slate-600 dark:text-slate-300">
											Operator: {getOperatorText(bus.operator)}
										</p>

										<div className="mt-4 flex items-center gap-2">
											<button
												type="button"
												onClick={() => openEditModal(bus)}
												className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-blue-200 px-2 py-2 text-xs font-semibold text-blue-700 transition hover:bg-blue-50 dark:border-blue-700/60 dark:text-blue-300 dark:hover:bg-blue-900/30"
											>
												<Pencil className="h-4 w-4" />
												Edit
											</button>
											<button
												type="button"
												onClick={() => openDuplicateModal(bus)}
												className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-300 px-2 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
											>
												<Copy className="h-4 w-4" />
												Duplicate
											</button>
											<button
												type="button"
												onClick={() => setDeletingBus(bus)}
												className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-rose-200 px-2 py-2 text-xs font-semibold text-rose-600 transition hover:bg-rose-50 dark:border-rose-800/60 dark:text-rose-300 dark:hover:bg-rose-900/30"
											>
												<Trash2 className="h-4 w-4" />
												Delete
											</button>
										</div>
									</div>
								</article>
							);
						})}
					</div>
				)}
			</section>

			{!loading && filteredBuses.length > 0 ? (
				<section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900">
					<p className="text-slate-500 dark:text-slate-400">
						Showing {pageStart}-{pageEnd} of {filteredBuses.length}
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
							Page {page} / {totalPages}
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
				</section>
			) : null}

			<BusModal
				open={busModalOpen}
				mode={modalMode}
				bus={modalBus}
				submitting={submitting}
				onClose={() => {
					if (submitting) return;
					setBusModalOpen(false);
					setModalMode("create");
					setModalBus(null);
				}}
				onSubmit={handleBusSubmit}
			/>

			<ConfirmDialog
				open={Boolean(deletingBus)}
				title="Delete Bus?"
				message={`Are you sure you want to delete "${deletingBus?.name || "this bus"}"? This action cannot be undone.`}
				confirmLabel="Confirm Delete"
				cancelLabel="Cancel"
				loading={deleting}
				onCancel={() => {
					if (deleting) return;
					setDeletingBus(null);
				}}
				onConfirm={confirmDeleteBus}
			/>
		</div>
	);
}
