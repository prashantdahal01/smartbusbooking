// Operator page for viewing the passenger list for a specific schedule
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { getPassengers } from "../../services/operator.service";

export default function PassengerList() {
	const { scheduleId } = useParams();
	const [bookings, setBookings] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		const run = async () => {
			setLoading(true);
			setError("");
			try {
				const data = await getPassengers(scheduleId);
				setBookings(data);
			} catch (err) {
				setError(err?.response?.data?.message || err.message || "Failed to load passengers");
			} finally {
				setLoading(false);
			}
		};
		run();
	}, [scheduleId]);

	return (
		<div className="mx-auto max-w-5xl px-4 py-10">
			<div className="flex items-end justify-between gap-4">
				<div>
					<h2 className="text-2xl font-extrabold text-slate-900">Passenger List</h2>
					<p className="mt-1 text-sm text-slate-600">Confirmed bookings for this schedule.</p>
				</div>
			</div>

			{error ? (
				<div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
			) : null}
			{loading ? <div className="mt-6 text-sm text-slate-600">Loading...</div> : null}

			<div className="mt-6 grid gap-4">
				{bookings.map((b) => (
					<div key={b._id} className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div>
								<div className="text-base font-extrabold text-slate-900">{b.passenger?.name || b.user?.name || "(unknown)"}</div>
								<div className="mt-1 text-sm text-slate-600">
									{b.passenger?.gender ? `${b.passenger.gender}` : ""}
									{b.passenger?.age ? ` • ${b.passenger.age} yrs` : ""}
								</div>
								<div className="mt-2 text-xs text-slate-600">
									Phone: <span className="font-semibold text-slate-900">{b.passenger?.phone || b.user?.phone || "—"}</span>
								</div>
								{b.user?.email ? <div className="mt-1 text-xs text-slate-500">Account: {b.user.email}</div> : null}
							</div>
							<div className="text-right">
								<div className="text-xs text-slate-500">Seats</div>
								<div className="text-sm font-semibold text-slate-900">{Array.isArray(b.seats) ? b.seats.join(", ") : "—"}</div>
							</div>
						</div>
					</div>
				))}
				{bookings.length === 0 && !loading ? <div className="text-sm text-slate-600">No passengers.</div> : null}
			</div>
		</div>
	);
}
