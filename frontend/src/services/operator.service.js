// Service functions for operator API calls (buses, schedules, passengers)
import axiosInstance from "./axios";

// getMyBuses()                    – GET /api/operator/buses
// getMySchedules()                – GET /api/operator/schedules
// getPassengers(scheduleId)       – GET /api/operator/passengers/:scheduleId

export async function getMyBuses() {
	const res = await axiosInstance.get("/operator/buses");
	return res.data;
}

export async function getMySchedules() {
	const res = await axiosInstance.get("/operator/schedules");
	return res.data;
}

export async function getPassengers(scheduleId) {
	const res = await axiosInstance.get(`/operator/passengers/${scheduleId}`);
	return res.data;
}
