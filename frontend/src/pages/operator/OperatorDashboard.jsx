// Operator overview page showing assigned buses and upcoming schedule summary
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getMySchedules } from "../../services/operator.service";

export default function OperatorDashboard() {
	const [schedules, setSchedules] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		const run = async () => {
			setLoading(true);
			setError("");
			try {
				const data = await getMySchedules();
				setSchedules(data);
			} catch (err) {
				setError(err?.response?.data?.message || err.message || "Failed to load schedules");
			} finally {
				setLoading(false);
			}
		};
		run();
	}, []);

	return (
		<div style={{ padding: 16 }}>
			<h2>Operator Dashboard</h2>
			{error ? <div>{error}</div> : null}
			{loading ? <div>Loading...</div> : null}
			<div style={{ display: "grid", gap: 10, marginTop: 10 }}>
				{schedules.map((s) => (
					<div key={s._id} style={{ padding: 10, border: "1px solid" }}>
						<div style={{ fontWeight: 700 }}>{s.route?.source} → {s.route?.destination}</div>
						<div>{s.date} {s.time} – Bus: {s.bus?.name}</div>
						<div style={{ marginTop: 6 }}>
							<Link to={`/operator/passengers/${s._id}`}>View passengers</Link>
						</div>
					</div>
				))}
				{schedules.length === 0 && !loading ? <div>No schedules.</div> : null}
			</div>
		</div>
	);
}
