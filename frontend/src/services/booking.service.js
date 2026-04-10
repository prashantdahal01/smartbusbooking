// Service functions for booking API calls
import axiosInstance from "./axios";

// createBooking(bookingData)  – POST /api/bookings
// getMyBookings()             – GET  /api/bookings
// getBookingById(id)          – GET  /api/bookings/:id
// cancelBooking(id)           – DELETE /api/bookings/:id

export async function searchSchedules({ source, destination, date }) {
	const params = new URLSearchParams();
	if (source) params.set("source", source);
	if (destination) params.set("destination", destination);
	if (date) params.set("date", date);
	const res = await axiosInstance.get(`/schedules/search?${params.toString()}`);
	return res.data;
}

export async function getScheduleSearchOptions() {
	const res = await axiosInstance.get("/schedules/options");
	return res.data;
}

export async function getSeatStatus(scheduleId) {
	const res = await axiosInstance.get(`/schedules/${scheduleId}/seat-status`);
	return res.data;
}


export async function lockSeats({ scheduleId, seats }) {
	const res = await axiosInstance.post("/bookings/lock", { scheduleId, seats });
	return res.data;
}

export async function unlockSeats({ scheduleId, seats }) {
	const res = await axiosInstance.post("/bookings/unlock", { scheduleId, seats });
	return res.data;
}

export async function createBooking({ scheduleId, seats, passenger, boardingPoint, droppingPoint }) {
	const res = await axiosInstance.post("/bookings", { scheduleId, seats, passenger, boardingPoint, droppingPoint });
	return res.data;
}

export async function initiateEsewaPayment({ scheduleId, seats, passenger, boardingPoint, droppingPoint }) {
	const res = await axiosInstance.post("/payments/esewa/initiate", { scheduleId, seats, passenger, boardingPoint, droppingPoint });
	return res.data;
}

export async function getMyBookings() {
	const res = await axiosInstance.get("/bookings");
	return res.data;
}

export async function getBookingById(id) {
	const res = await axiosInstance.get(`/bookings/${id}`);
	return res.data;
}

export async function cancelBooking(id) {
	const res = await axiosInstance.delete(`/bookings/${id}`);
	return res.data;
}

export async function getBookingTicketPdf(id) {
	const res = await axiosInstance.get(`/bookings/${id}/ticket`, {
		responseType: "blob",
		headers: { Accept: "application/pdf" },
	});
	return res.data;
}
