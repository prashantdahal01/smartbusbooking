import axiosInstance from "./axios";

const compactParams = (params = {}) => {
	const output = {};
	Object.entries(params).forEach(([key, value]) => {
		if (value === undefined || value === null || value === "") return;
		output[key] = value;
	});
	return output;
};

export async function getOperatorBuses() {
	const res = await axiosInstance.get("/buses/operator");
	return res.data;
}

export async function createOperatorBus(payload) {
	const res = await axiosInstance.post("/buses", payload);
	return res.data;
}

export async function updateOperatorBus(id, payload) {
	const res = await axiosInstance.put(`/buses/${id}`, payload);
	return res.data;
}

export async function deleteOperatorBus(id) {
	const res = await axiosInstance.delete(`/buses/${id}`);
	return res.data;
}

export async function getOperatorSchedules(params = {}) {
	const res = await axiosInstance.get("/schedules/operator", {
		params: compactParams(params),
	});
	return res.data;
}

export async function createOperatorSchedule(payload) {
	const res = await axiosInstance.post("/schedules", payload);
	return res.data;
}

export async function updateOperatorSchedule(id, payload) {
	const res = await axiosInstance.put(`/schedules/${id}`, payload);
	return res.data;
}

export async function deleteOperatorSchedule(id) {
	const res = await axiosInstance.delete(`/schedules/${id}`);
	return res.data;
}

export async function getOperatorBookings(params = {}) {
	const res = await axiosInstance.get("/bookings/operator", {
		params: compactParams(params),
	});
	return res.data;
}

export async function getOperatorSeatStatus(scheduleId) {
	const res = await axiosInstance.get(`/schedules/${scheduleId}/seat-status`);
	return res.data;
}

export async function getRouteCatalog() {
	const res = await axiosInstance.get("/routes");
	return res.data;
}

export async function getOperatorDashboardData() {
	const [buses, schedules, bookingPayload] = await Promise.all([
		getOperatorBuses(),
		getOperatorSchedules(),
		getOperatorBookings(),
	]);

	return {
		buses: Array.isArray(buses) ? buses : [],
		schedules: Array.isArray(schedules) ? schedules : [],
		bookings: Array.isArray(bookingPayload?.items) ? bookingPayload.items : [],
		bookingSummary: bookingPayload?.summary || {
			totalBookings: 0,
			totalRevenue: 0,
			paidCount: 0,
			cancelledCount: 0,
			byBus: [],
			byDay: [],
		},
		availableSchedules: Array.isArray(bookingPayload?.availableSchedules)
			? bookingPayload.availableSchedules
			: [],
	};
}

// Backward-compatible exports for older operator pages.
export const getMyBuses = getOperatorBuses;
export const getMySchedules = getOperatorSchedules;

export async function getPassengers(scheduleId) {
	const payload = await getOperatorBookings({ schedule: scheduleId });
	return Array.isArray(payload?.items) ? payload.items : [];
}

export async function getProfileForOperator() {
	const res = await axiosInstance.get("/users/profile");
	return res.data;
}

export async function updateOperatorProfile(payload) {
	const res = await axiosInstance.put("/users/profile", payload);
	return res.data;
}
