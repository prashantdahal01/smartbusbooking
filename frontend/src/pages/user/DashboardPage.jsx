// Customer dashboard showing booking history
import { useEffect, useState } from "react";
import { cancelBooking, getMyBookings } from "../../services/booking.service";
import BookingCard from "../../components/BookingCard";

export default function DashboardPage() {
	const [bookings, setBookings] = useState([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState("");

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const data = await getMyBookings();
			setBookings(data);
		} catch (err) {
			setError(err?.response?.data?.message || err.message || "Failed to load bookings");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const onCancel = async (id) => {
		try {
			await cancelBooking(id);
			await load();
		} catch (err) {
			setError(err?.response?.data?.message || err.message || "Cancel failed");
		}
	};

	return (
		<div style={{ padding: 16 }}>
			<h2>My Bookings</h2>
			{error ? <div>{error}</div> : null}
			{loading ? <div>Loading...</div> : null}
			<div style={{ display: "grid", gap: 12, marginTop: 12 }}>
				{bookings.map((b) => (
					<BookingCard key={b._id} booking={b} onCancel={onCancel} />
				))}
				{bookings.length === 0 && !loading ? <div>No bookings yet.</div> : null}
			</div>
		</div>
	);
}
