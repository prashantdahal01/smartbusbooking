// Card component summarizing a booking (route, date, seats, fare, status)
// Used in customer dashboard and booking confirmation
import { useState } from "react";
import { formatCurrency } from "../utils/helpers";
import { getBookingTicketPdf } from "../services/booking.service";

export default function BookingCard({ booking, onCancel }) {
	if (!booking) return null;
	const route = booking.schedule?.route;
	const bus = booking.schedule?.bus;
	const [printing, setPrinting] = useState(false);

	const onPrint = async () => {
		if (!booking?._id || printing) return;
		setPrinting(true);
		try {
			const pdfBlob = await getBookingTicketPdf(booking._id);
			const url = window.URL.createObjectURL(pdfBlob);
			window.open(url, "_blank", "noopener,noreferrer");
			window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
		} catch (e) {
			const msg = e?.response?.data?.message || e?.message || "Failed to load ticket PDF";
			// eslint-disable-next-line no-alert
			alert(msg);
		} finally {
			setPrinting(false);
		}
	};
	return (
		<div style={{ padding: 12, border: "1px solid" }}>
			<div style={{ fontWeight: 700 }}>{route?.source} → {route?.destination}</div>
			<div>{booking.schedule?.date} {booking.schedule?.time} – Bus: {bus?.name}</div>
			<div>Seats: {booking.seats?.join(", ")}</div>
			<div>Status: {booking.status}</div>
			{booking.schedule?.price !== undefined ? <div>Price: {formatCurrency(booking.schedule.price)}</div> : null}
			{booking.status === "confirmed" ? (
				<div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
					<button onClick={onPrint} disabled={printing}>
						{printing ? "Preparing Ticket..." : "Print Ticket"}
					</button>
					{onCancel ? <button onClick={() => onCancel(booking._id)}>Cancel</button> : null}
				</div>
			) : null}
		</div>
	);
}
