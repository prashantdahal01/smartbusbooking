// Shared utility and helper functions for the frontend application

// formatDate(date)         – Format a date to a human-readable string
// formatCurrency(amount)   – Format a number as currency (e.g., NPR 1,200)
// capitalize(str)          – Capitalize the first letter of a string

export function capitalize(str) {
	const s = String(str || "");
	if (!s) return "";
	return s.charAt(0).toUpperCase() + s.slice(1);
}

export function formatDate(date) {
	if (!date) return "";
	const d = typeof date === "string" ? new Date(date) : date;
	if (!(d instanceof Date) || Number.isNaN(d.getTime())) return String(date);
	return d.toLocaleDateString();
}

export function formatCurrency(amount, currency = "NPR") {
	const n = Number(amount);
	if (Number.isNaN(n)) return String(amount ?? "");
	try {
		return new Intl.NumberFormat(undefined, {
			style: "currency",
			currency,
			maximumFractionDigits: 0,
		}).format(n);
	} catch {
		return `${currency} ${n.toLocaleString()}`;
	}
}

export function getApiBaseUrl() {
	return import.meta.env.VITE_API_URL || "http://localhost:5001/api";
}

export function getApiOrigin() {
	const base = String(getApiBaseUrl());
	return base.replace(/\/?api\/?$/i, "");
}

export function toAbsoluteAssetUrl(assetPath) {
	if (!assetPath) return "";
	const p = String(assetPath);
	if (/^https?:\/\//i.test(p)) return p;
	const origin = getApiOrigin();
	if (!origin) return p;
	return `${origin}${p.startsWith("/") ? "" : "/"}${p}`;
}

const BUS_IMAGE_TYPE_ALIASES = {
	bus: "bus",
	main: "bus",
	image: "bus",
	exterior: "bus",
	seat: "seatLayout",
	"seat-layout": "seatLayout",
	seatlayout: "seatLayout",
	layout: "seatLayout",
	sleeper: "sleeperLayout",
	"sleeper-layout": "sleeperLayout",
	sleeperlayout: "sleeperLayout",
};

function normalizeBusImageType(type) {
	const token = String(type || "bus")
		.trim()
		.toLowerCase()
		.replace(/[\s_]+/g, "-");
	return BUS_IMAGE_TYPE_ALIASES[token] || "";
}

function toSafeImagePath(value) {
	return String(value || "").trim();
}

function readImagePathFromArray(images, normalizedType) {
	if (!Array.isArray(images)) return "";

	for (const item of images) {
		const type = normalizeBusImageType(item?.type);
		if (!type || type !== normalizedType) continue;

		const url = toSafeImagePath(item?.url);
		if (url) return url;
	}

	return "";
}

export function getBusImagePath(bus, type = "bus") {
	const normalizedType = normalizeBusImageType(type) || "bus";
	const images = bus?.images;

	if (images && typeof images === "object" && !Array.isArray(images)) {
		const directPath = toSafeImagePath(images?.[normalizedType]);
		if (directPath) return directPath;
	}

	const fromArray = readImagePathFromArray(images, normalizedType);
	if (fromArray) return fromArray;

	if (normalizedType === "bus") {
		const legacy = toSafeImagePath(bus?.imageUrl || bus?.image);
		if (legacy) return legacy;
	}

	return "";
}

export function getBusImageUrl(bus, type = "bus") {
	return toAbsoluteAssetUrl(getBusImagePath(bus, type));
}

export function getBusImageUrls(bus) {
	return {
		bus: getBusImageUrl(bus, "bus"),
		seatLayout: getBusImageUrl(bus, "seatLayout"),
		sleeperLayout: getBusImageUrl(bus, "sleeperLayout"),
	};
}
