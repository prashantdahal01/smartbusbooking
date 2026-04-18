// Operator page for viewing and managing their assigned buses
import { useEffect, useState } from "react";
import { getMyBuses } from "../../services/operator.service";
import { getBusTypeSummary } from "../../utils/busTypeUtils";

export default function MyBuses() {
	const [buses, setBuses] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

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

	return (
		<div style={{ padding: 16 }}>
			<h2>My Buses</h2>
			{error ? <div>{error}</div> : null}
			{loading ? <div>Loading...</div> : null}
			<div style={{ display: "grid", gap: 10, marginTop: 10 }}>
				{buses.map((b) => (
					<div key={b._id} style={{ padding: 10, border: "1px solid" }}>
						<div style={{ fontWeight: 700 }}>{b.name}</div>
						<div>Type: {getBusTypeSummary(b, 2)} – Seats: {b.totalSeats}</div>
					</div>
				))}
				{buses.length === 0 && !loading ? <div>No assigned buses.</div> : null}
			</div>
		</div>
	);
}
