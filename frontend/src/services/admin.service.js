// Service functions for admin API calls (user management, system stats)
import axiosInstance from "./axios";

// getAllUsers()           – GET    /api/admin/users
// updateUser(id, data)   – PUT    /api/admin/users/:id
// deleteUser(id)         – DELETE /api/admin/users/:id
// getSystemStats()       – GET    /api/admin/stats

export async function getBuses() {
	const res = await axiosInstance.get("/admin/bus");
	return res.data;
}

export async function createBus(data) {
	const res = await axiosInstance.post("/admin/bus", data);
	return res.data;
}

export async function getRoutes() {
	const res = await axiosInstance.get("/admin/route");
	return res.data;
}

export async function getDistricts() {
	const res = await axiosInstance.get("/districts");
	return res.data;
}

export async function getRouteStops(routeId) {
	const res = await axiosInstance.get(`/routes/${routeId}/stops`);
	return res.data;
}

export async function autoGenerateStops({ routeId, overwrite = false }) {
	const res = await axiosInstance.post("/stops/auto-generate", { routeId, overwrite });
	return res.data;
}

export async function createStop(data) {
	const res = await axiosInstance.post("/stops", data);
	return res.data;
}

export async function updateStop(id, data) {
	const res = await axiosInstance.put(`/stops/${id}`, data);
	return res.data;
}

export async function deleteStop(id) {
	const res = await axiosInstance.delete(`/stops/${id}`);
	return res.data;
}

export async function createRoute(data) {
	const res = await axiosInstance.post("/admin/route", data);
	return res.data;
}

export async function updateRoute(id, data) {
	const res = await axiosInstance.put(`/admin/route/${id}`, data);
	return res.data;
}

export async function createSchedule(data) {
	const res = await axiosInstance.post("/admin/schedule", data);
	return res.data;
}

export async function getSchedules() {
	const res = await axiosInstance.get("/admin/schedule");
	return res.data;
}

export async function updateSchedule(id, data) {
	const res = await axiosInstance.put(`/admin/schedule/${id}`, data);
	return res.data;
}

export async function deleteSchedule(id) {
	const res = await axiosInstance.delete(`/admin/schedule/${id}`);
	return res.data;
}

export async function getAllUsers() {
	const res = await axiosInstance.get("/admin/users");
	return res.data;
}
