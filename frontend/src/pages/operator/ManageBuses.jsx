import { AlertCircle, BusFront, Pencil } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import BusForm from "../../components/operator/BusForm";
import {
	getOperatorBuses,
	updateOperatorBus,
} from "../../services/operator.service";
import { getBusTypeSummary } from "../../utils/busTypeUtils";

export default function ManageBuses() {
	const [loading, setLoading] = useState(true);
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [buses, setBuses] = useState([]);
	const [query, setQuery] = useState("");

	const [formOpen, setFormOpen] = useState(false);
	const [editingBus, setEditingBus] = useState(null);

	const loadBuses = async () => {
		setLoading(true);
		setError("");
		try {
			const data = await getOperatorBuses();
			setBuses(Array.isArray(data) ? data : []);
		} catch (err) {
			setError(err?.response?.data?.message || err?.message || "Failed to load buses");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadBuses();
	}, []);

	useEffect(() => {
		if (!notice) return undefined;
		const timer = setTimeout(() => setNotice(""), 2600);
		return () => clearTimeout(timer);
	}, [notice]);

	const rows = useMemo(() => {
		const keyword = String(query || "").trim().toLowerCase();
		if (!keyword) return buses;

		return buses.filter((bus) => {
			const haystack = `${bus?.name || ""} ${bus?.vehicleNumber || ""} ${bus?.phone || ""}`.toLowerCase();
			return haystack.includes(keyword);
		});
	}, [buses, query]);

	const openEdit = (bus) => {
		setEditingBus(bus);
		setFormOpen(true);
	};

	const submitBus = async (payload) => {
		setSubmitting(true);
		setError("");

		try {
			if (!editingBus?._id) {
				throw new Error("No bus selected for update");
			}

			await updateOperatorBus(editingBus._id, payload);
			setNotice("Bus updated successfully");

			setFormOpen(false);
			setEditingBus(null);
			await loadBuses();
		} catch (err) {
			setError(err?.response?.data?.message || err?.message || "Failed to update bus");
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="space-y-5">
			{notice ? (
				<div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
					{notice}
				</div>
			) : null}

			<div className="flex flex-wrap items-end justify-between gap-3">
				<div>
					<h2 className="text-2xl font-bold text-slate-900">Manage Buses</h2>
					<p className="text-sm text-slate-500">Update basic bus details for your assigned fleet only.</p>
				</div>
			</div>

			<div
				className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
				title="Only admin can modify seat capacity"
			>
				<p className="inline-flex items-center gap-2 font-semibold">
					<AlertCircle className="h-4 w-4" />
					Seat capacity and seat layout are locked for operators.
				</p>
				<p className="mt-1 text-xs">Only name, bus type, and phone number can be edited.</p>
			</div>

			<section className="admin-surface p-4">
				<input
					value={query}
					onChange={(event) => setQuery(event.target.value)}
					placeholder="Search by bus name, number, or phone"
					className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-orange-200 focus:ring-2 focus:ring-orange-100"
				/>
			</section>

			{error ? (
				<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
					{error}
				</div>
			) : null}

			{loading ? (
				<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
					{Array.from({ length: 6 }).map((_, index) => (
						<div key={`bus-skeleton-${index}`} className="admin-surface p-4">
							<div className="skeleton h-5 w-2/3" />
							<div className="mt-3 space-y-2">
								<div className="skeleton h-4 w-1/2" />
								<div className="skeleton h-4 w-3/4" />
								<div className="skeleton h-9 w-full" />
							</div>
						</div>
					))}
				</div>
			) : rows.length === 0 ? (
				<div className="admin-surface grid place-items-center p-10 text-center">
					<div className="grid h-14 w-14 place-items-center rounded-full bg-slate-100 text-slate-500">
						<BusFront className="h-7 w-7" />
					</div>
					<h3 className="mt-4 text-lg font-semibold text-slate-900">No buses found</h3>
					<p className="mt-1 text-sm text-slate-500">Ask admin to assign buses before managing schedules.</p>
				</div>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
					{rows.map((bus) => (
						<article key={bus._id} className="admin-surface admin-surface-hover p-4">
							<div className="flex items-start justify-between gap-3">
								<div>
									<h3 className="text-base font-bold text-slate-900">{bus.name}</h3>
									<p className="mt-1 text-xs text-slate-500">{bus.vehicleNumber}</p>
								</div>
								<span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-semibold text-orange-700">
									{bus.scheduleCount || 0} schedules
								</span>
							</div>

							<div className="mt-3 space-y-1 text-sm text-slate-600">
								<p title="Only admin can modify seat capacity">
									Seats: <span className="font-semibold text-slate-900">{bus.totalSeats || 0}</span>
								</p>
								<p>Type: <span className="font-semibold text-slate-900">{getBusTypeSummary(bus, 2)}</span></p>
								<p>Phone: <span className="font-semibold text-slate-900">{bus.phone || "-"}</span></p>
							</div>

							<div className="mt-4 flex items-center gap-2">
								<button
									type="button"
									onClick={() => openEdit(bus)}
									className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
								>
									<Pencil className="h-4 w-4" />
									Edit
								</button>
							</div>
						</article>
					))}
				</div>
			)}

			<BusForm
				open={formOpen}
				mode="edit"
				initialValues={editingBus}
				onSubmit={submitBus}
				onClose={() => {
					setFormOpen(false);
					setEditingBus(null);
				}}
				loading={submitting}
			/>
		</div>
	);
}
