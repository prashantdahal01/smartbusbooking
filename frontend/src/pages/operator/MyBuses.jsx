import { BusFront, Phone, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { getMyBuses } from "../../services/operator.service";
import { getBusTypeSummary } from "../../utils/busTypeUtils";

export default function MyBuses() {
	const [buses, setBuses] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");
	const [query, setQuery] = useState("");

	useEffect(() => {
		const run = async () => {
			setLoading(true);
			setError("");
			try {
				const data = await getMyBuses();
				setBuses(data);
			} catch (err) {
				setError(err?.response?.data?.message || err.message || "Failed to load buses");
			} finally {
				setLoading(false);
			}
		};
		run();
	}, []);

	const rows = useMemo(() => {
		const keyword = String(query || "").trim().toLowerCase();
		if (!keyword) return buses;

		return buses.filter((bus) => {
			const haystack = `${bus?.name || ""} ${bus?.vehicleNumber || ""} ${bus?.phone || ""}`.toLowerCase();
			return haystack.includes(keyword);
		});
	}, [buses, query]);

	const summary = useMemo(() => {
		return {
			totalBuses: buses.length,
			totalSeats: buses.reduce((sum, bus) => sum + (Number(bus?.totalSeats) || 0), 0),
			totalSchedules: buses.reduce((sum, bus) => sum + (Number(bus?.scheduleCount) || 0), 0),
		};
	}, [buses]);

	return (
		<div className="space-y-5">
			<div>
				<h2 className="text-2xl font-bold text-slate-900">My Buses</h2>
				<p className="text-sm text-slate-500">Read-only view of buses assigned to your operator account.</p>
			</div>

			<section className="grid gap-4 sm:grid-cols-3">
				<div className="admin-surface p-4">
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Assigned Buses</p>
					<p className="mt-2 flex items-center gap-2 text-2xl font-bold text-slate-900">
						<BusFront className="h-5 w-5 text-blue-600" />
						{loading ? "..." : summary.totalBuses}
					</p>
				</div>

				<div className="admin-surface p-4">
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Seats</p>
					<p className="mt-2 text-2xl font-bold text-slate-900">{loading ? "..." : summary.totalSeats}</p>
				</div>

				<div className="admin-surface p-4">
					<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Future Schedules</p>
					<p className="mt-2 text-2xl font-bold text-slate-900">{loading ? "..." : summary.totalSchedules}</p>
				</div>
			</section>

			<section className="admin-surface p-4">
				<div className="flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3">
					<Search className="h-4 w-4 text-slate-400" />
					<input
						value={query}
						onChange={(event) => setQuery(event.target.value)}
						placeholder="Search by bus name, number, or phone"
						className="w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
					/>
				</div>
			</section>

			{error ? (
				<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
			) : null}

			{loading ? (
				<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
					{Array.from({ length: 6 }).map((_, index) => (
						<div key={`my-bus-skeleton-${index}`} className="admin-surface p-4">
							<div className="skeleton h-5 w-2/3" />
							<div className="mt-3 space-y-2">
								<div className="skeleton h-4 w-3/4" />
								<div className="skeleton h-4 w-2/3" />
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
					<p className="mt-1 text-sm text-slate-500">No assigned buses match your search.</p>
				</div>
			) : (
				<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
					{rows.map((bus) => (
						<article key={bus._id} className="admin-surface p-4">
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
								<p>Type: <span className="font-semibold text-slate-900">{getBusTypeSummary(bus, 2)}</span></p>
								<p>Seats: <span className="font-semibold text-slate-900">{bus.totalSeats || 0}</span></p>
								<p className="inline-flex items-center gap-1.5">
									<Phone className="h-3.5 w-3.5 text-slate-400" />
									<span className="font-semibold text-slate-900">{bus.phone || "-"}</span>
								</p>
							</div>
						</article>
					))}
				</div>
			)}
		</div>
	);
}
