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
