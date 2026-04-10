// Admin page for viewing and managing all registered user accounts
import { useEffect, useState } from "react";
import { getAllUsers } from "../../services/admin.service";

export default function ManageUsers() {
	const [users, setUsers] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	useEffect(() => {
		const run = async () => {
			setLoading(true);
			setError("");
			try {
				const data = await getAllUsers();
				setUsers(data);
			} catch (err) {
				setError(err?.response?.data?.message || err.message || "Failed to load users");
			} finally {
				setLoading(false);
			}
		};
		run();
	}, []);

	return (
		<div style={{ padding: 16 }}>
			<h2>Users</h2>
			{error ? <div>{error}</div> : null}
			{loading ? <div>Loading...</div> : null}
			<div style={{ display: "grid", gap: 10, marginTop: 10 }}>
				{users.map((u) => (
					<div key={u._id} style={{ padding: 10, border: "1px solid" }}>
						<div style={{ fontWeight: 700 }}>{u.name}</div>
						<div>{u.email} – {u.role}</div>
						<div>Phone: {u.phone || "-"}</div>
					</div>
				))}
			</div>
		</div>
	);
}
