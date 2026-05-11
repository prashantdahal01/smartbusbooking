// Service functions for admin API calls (user management, system stats)
import axiosInstance from "./axios";

// getAllUsers()           – GET    /api/admin/users
// updateUser(id, data)   – PUT    /api/admin/users/:id
// deleteUser(id)         – DELETE /api/admin/users/:id
// getSystemStats()       – GET    /api/admin/stats

const unwrapData = (payload) => {
	if (payload && typeof payload === "object" && Object.prototype.hasOwnProperty.call(payload, "data")) {
		return payload.data;
	}
	return payload;
};

export async function getBuses() {
	const res = await axiosInstance.get("/admin/bus");
	return unwrapData(res.data);
}

export async function createBus(data) {
	const res = await axiosInstance.post("/admin/bus", data);
	return unwrapData(res.data);
}

export async function updateBus(id, data) {
	const res = await axiosInstance.put(`/admin/bus/${id}`, data);
	return unwrapData(res.data);
}

export async function deleteBus(id) {
	const res = await axiosInstance.delete(`/admin/bus/${id}`);
	return unwrapData(res.data);
}

export async function getRoutes() {
	const res = await axiosInstance.get("/admin/route");
	return res.data;
}

export async function getDistricts() {
	const res = await axiosInstance.get("/districts");
	return res.data;
}

export async function createDistrictWithCities(data) {
	const res = await axiosInstance.post("/districts", data);
	return res.data;
}

export async function updateDistrict(id, data) {
	const res = await axiosInstance.put(`/districts/${id}`, data);
	return res.data;
}

export async function deleteDistrict(id) {
	const res = await axiosInstance.delete(`/districts/${id}`);
	return res.data;
}

export async function addCityToDistrict(districtId, data) {
	const res = await axiosInstance.post(`/districts/${districtId}/cities`, data);
	return res.data;
}

export async function updateCity(districtId, cityId, data) {
	const res = await axiosInstance.put(`/districts/${districtId}/cities/${cityId}`, data);
	return res.data;
}

export async function deleteCity(districtId, cityId) {
	const res = await axiosInstance.delete(`/districts/${districtId}/cities/${cityId}`);
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

export async function deleteRoute(id) {
	const res = await axiosInstance.delete(`/admin/route/${id}`);
	return res.data;
}

export async function syncRoutePoints(id) {
	const res = await axiosInstance.post(`/routes/${id}/sync-points`);
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

export async function updateUserByAdmin(id, data) {
	const res = await axiosInstance.put(`/admin/users/${id}`, data);
	return res.data;
}

export async function deleteUserByAdmin(id) {
	const res = await axiosInstance.delete(`/admin/users/${id}`);
	return res.data;
}

export async function getUserBookingsByAdmin(id) {
	const res = await axiosInstance.get(`/admin/users/${id}/bookings`);
	return res.data;
}

const withRangeParams = (range, extraParams = {}) => ({
	...extraParams,
	...(range ? { range } : {}),
});

export async function getAdminStats(range = "30d") {
	const res = await axiosInstance.get("/admin/stats", {
		params: withRangeParams(range),
	});
	return res.data;
}

export async function getAdminMonthlyBookings(range = "30d") {
	const res = await axiosInstance.get("/admin/monthly-bookings", {
		params: withRangeParams(range),
	});
	return res.data;
}

export async function getAdminTopRoutes(limit = 5, range = "30d") {
	const res = await axiosInstance.get("/admin/top-routes", {
		params: withRangeParams(range, { limit }),
	});
	return res.data;
}

export async function getAdminRevenue(range = "30d") {
	const res = await axiosInstance.get("/admin/revenue", {
		params: withRangeParams(range),
	});
	return res.data;
}

export async function getAdminRecentBookings(limit = 10, range = "30d") {
	const res = await axiosInstance.get("/admin/recent-bookings", {
		params: withRangeParams(range, { limit }),
	});
	return res.data;
}

export async function getAdminNotifications(limit = 20) {
	const res = await axiosInstance.get("/admin/notifications", {
		params: { limit },
	});
	return res.data;
}

export async function markAdminNotificationRead(id) {
	const res = await axiosInstance.patch(`/admin/notifications/${id}/read`);
	return res.data;
}

export async function markAllAdminNotificationsRead() {
	const res = await axiosInstance.patch("/admin/notifications/read-all");
	return res.data;
}

export async function searchAdminResources(q) {
	const res = await axiosInstance.get("/admin/search", {
		params: { q },
	});
	return res.data;
}

export async function getAdminBookings({
	q = "",
	status = "all",
	page = 1,
	limit = 10,
	range = "30d",
} = {}) {
	const res = await axiosInstance.get("/admin/bookings", {
		params: {
			q,
			status,
			page,
			limit,
			range,
		},
	});
	return res.data;
}

export async function cancelAdminBooking(id) {
	const res = await axiosInstance.patch(`/admin/bookings/${id}/cancel`);
	return res.data;
}
