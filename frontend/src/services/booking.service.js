// Service functions for booking API calls
import axiosInstance from "./axios";

// createBooking(bookingData)  – POST /api/bookings
// getMyBookings()             – GET  /api/bookings
// getBookingById(id)          – GET  /api/bookings/:id

const isValidDateKey = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());

const getTodayStartDate = () => {
	const now = new Date();
	now.setHours(0, 0, 0, 0);
	return now;
};

const toScheduleDate = (schedule) => {
	const dateKey = String(schedule?.travelDate || schedule?.date || "").trim();
	if (!isValidDateKey(dateKey)) return null;
	const parsed = new Date(`${dateKey}T00:00:00`);
	if (Number.isNaN(parsed.getTime())) return null;
	return parsed;
};

const isValidUpcomingSchedule = (schedule, todayStart) => {
	if (!schedule || typeof schedule !== "object") return false;
	if (!schedule.bus || schedule.bus?.isActive === false) return false;

	const scheduleDate = toScheduleDate(schedule);
	if (!scheduleDate) return false;

	return scheduleDate.getTime() >= todayStart.getTime();
};

const filterValidSchedules = (rows) => {
	const todayStart = getTodayStartDate();
	return (Array.isArray(rows) ? rows : []).filter((schedule) => isValidUpcomingSchedule(schedule, todayStart));
};

export async function searchSchedules({ source, destination, date, includeRoutePlan = false, sortBy } = {}) {
	const params = new URLSearchParams();
	if (source) params.set("source", source);
	if (destination) params.set("destination", destination);
	if (date) params.set("date", date);
	if (sortBy) params.set("sortBy", sortBy);
	if (includeRoutePlan) params.set("includeRoutePlan", "true");
	const res = await axiosInstance.get(`/schedules/search?${params.toString()}`);

	if (includeRoutePlan) {
		return {
			...res.data,
			schedules: filterValidSchedules(res.data?.schedules),
		};
	}

	return filterValidSchedules(res.data);
}

export async function getAvailableSchedules() {
	const res = await axiosInstance.get("/schedules/available");
	return filterValidSchedules(res.data);
}

export async function getDistrictRoutePlan({ source, destination }) {
	const params = new URLSearchParams();
	if (source) params.set("source", source);
	if (destination) params.set("destination", destination);
	const res = await axiosInstance.get(`/schedules/route-plan?${params.toString()}`);
	return res.data;
}

export async function getScheduleSearchOptions() {
	const res = await axiosInstance.get("/schedules/options");
	return res.data;
}

export async function searchLocations({ q, limit = 10 } = {}) {
	const queryText = String(q || "").trim();
	if (!queryText) return [];

	const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.trunc(Number(limit)) : 10;
	const params = new URLSearchParams();
	params.set("q", queryText);
	params.set("limit", String(safeLimit));

	const res = await axiosInstance.get(`/locations/search?${params.toString()}`);
	return Array.isArray(res.data) ? res.data : [];
}

export async function getPopularRoutes(limit = 6) {
	const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Math.trunc(Number(limit)) : 6;
	const res = await axiosInstance.get(`/routes/popular?limit=${safeLimit}`);
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

export async function createBooking({ scheduleId, seats, passenger, passengers, boardingPoint, droppingPoint }) {
	const res = await axiosInstance.post("/bookings", { scheduleId, seats, passenger, passengers, boardingPoint, droppingPoint });
	return res.data?.data ?? res.data;
}

export async function initiateEsewaPayment({ scheduleId, seats, passenger, passengers, boardingPoint, droppingPoint }) {
	const res = await axiosInstance.post("/payments/esewa/initiate", { scheduleId, seats, passenger, passengers, boardingPoint, droppingPoint });
	return res.data?.data ?? res.data;
}

export async function retryEsewaPayment({ bookingId }) {
	const res = await axiosInstance.post("/payments/esewa/retry", { bookingId });
	return res.data?.data ?? res.data;
}

export async function verifyEsewaPayment({ bookingId }) {
	const res = await axiosInstance.post("/payments/esewa/verify", { bookingId });
	return res.data?.data ?? res.data;
}

export async function getMyBookings() {
	const res = await axiosInstance.get("/bookings");
	return res.data?.data ?? res.data;
}

export async function getBookingById(id) {
	const res = await axiosInstance.get(`/bookings/${id}`);
	return res.data?.data ?? res.data;
}

export async function submitReview({ bookingId, busId, rating, comment }) {
	const res = await axiosInstance.post("/reviews", {
		bookingId,
		busId,
		rating,
		comment,
	});
	return res.data?.review ?? res.data;
}

export async function getBusReviews(busId) {
	const res = await axiosInstance.get(`/reviews/bus/${busId}`);
	return res.data?.data ?? res.data;
}

export async function getMyReviews() {
	const res = await axiosInstance.get("/reviews/my");
	return res.data?.data ?? res.data;
}

const resolveDownloadFilename = (headers, fallback) => {
	const raw = String(headers?.["content-disposition"] || "");
	const utfMatch = raw.match(/filename\*=UTF-8''([^;]+)/i);
	if (utfMatch?.[1]) {
		return decodeURIComponent(utfMatch[1].trim());
	}

	const plainMatch = raw.match(/filename=\"?([^\";]+)\"?/i);
	if (plainMatch?.[1]) {
		return plainMatch[1].trim();
	}

	return fallback;
};

const parseErrorMessageFromText = (text, fallback) => {
	const raw = String(text || "").trim();
	if (!raw) return fallback;

	try {
		const parsed = JSON.parse(raw);
		if (parsed?.message) return String(parsed.message);
	} catch {
		// Non-JSON error body
	}

	if (/^<!doctype html>|<html[\s>]/i.test(raw)) {
		return fallback;
	}

	return raw.slice(0, 180);
};

const getBlobPdfSignature = async (blob) => {
	try {
		const header = await blob.slice(0, 5).arrayBuffer();
		return new TextDecoder("ascii").decode(header);
	} catch {
		return "";
	}
};

export async function getBookingTicketPdf(id) {
	const res = await axiosInstance.get(`/bookings/${id}/ticket`, {
		responseType: "blob",
		headers: { Accept: "application/pdf" },
		validateStatus: () => true,
	});

	const status = Number(res?.status || 0);
	const blob = res?.data instanceof Blob ? res.data : new Blob([res?.data || ""]);
	const contentType = String(res?.headers?.["content-type"] || blob.type || "").toLowerCase();

	if (status < 200 || status >= 300) {
		const responseText = await blob.text();
		const message = parseErrorMessageFromText(responseText, `Ticket download failed (HTTP ${status || "unknown"})`);
		throw new Error(message);
	}

	const signature = await getBlobPdfSignature(blob);
	const isPdfByType = contentType.includes("application/pdf");
	const isPdfBySignature = signature === "%PDF-";

	if (!isPdfByType && !isPdfBySignature) {
		const responseText = await blob.text();
		const message = parseErrorMessageFromText(responseText, "Server returned an invalid PDF response");
		throw new Error(message);
	}

	const safePdfBlob =
		blob.type === "application/pdf"
			? blob
			: new Blob([blob], { type: "application/pdf" });

	return {
		blob: safePdfBlob,
		filename: resolveDownloadFilename(res.headers, `ticket-${id}.pdf`),
	};
}
