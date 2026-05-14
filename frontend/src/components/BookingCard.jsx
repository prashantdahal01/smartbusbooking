// Card component summarizing a booking (route, date, seats, fare, status)
// Used in customer dashboard and booking confirmation
import { motion } from "framer-motion";
import { BusFront, CalendarDays, Clock3, MapPin, Star, Ticket } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { formatCurrency } from "../utils/helpers";

const statusClassByKey = {
	confirmed: "border-emerald-200 bg-emerald-50 text-emerald-700",
	cancelled: "border-rose-200 bg-rose-50 text-rose-700",
	payment_pending: "border-amber-200 bg-amber-50 text-amber-700",
	payment_failed: "border-slate-300 bg-slate-100 text-slate-700",
};

const normalizePaymentStatus = (value) => {
	const normalized = String(value || "").trim().toLowerCase();
	if (normalized === "paid") return "paid";
	if (normalized === "failed") return "failed";
	return "pending";
};

const normalizeBookingState = (booking) => {
	const rawBookingStatus = String(booking?.status || "").trim().toLowerCase();
	const paymentStatus = normalizePaymentStatus(booking?.paymentStatus || booking?.payment?.status);

	if (rawBookingStatus === "cancelled") {
		return {
			bookingStatus: "cancelled",
			paymentStatus,
			label: "Cancelled",
			classKey: "cancelled",
		};
	}

	if (rawBookingStatus === "confirmed") {
		return {
			bookingStatus: "confirmed",
			paymentStatus: "paid",
			label: "Confirmed",
			classKey: "confirmed",
		};
	}

	if (paymentStatus === "failed" || rawBookingStatus === "payment_failed") {
		return {
			bookingStatus: "pending",
			paymentStatus: "failed",
			label: "Payment Failed",
			classKey: "payment_failed",
		};
	}

	return {
		bookingStatus: "pending",
		paymentStatus: "pending",
		label: "Payment Pending",
		classKey: "payment_pending",
	};
};

const formatCountdown = (ms) => {
	const safeMs = Math.max(0, Number(ms) || 0);
	const totalSeconds = Math.floor(safeMs / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const formatDateLabel = (rawDate) => {
  const text = String(rawDate || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return text || "Date N/A";
  const parsed = new Date(`${text}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return text;
  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
};

export default function BookingCard({
	booking,
	nowMs = Date.now(),
	onRetryPayment,
	retrying = false,
	review,
	canReview = false,
	onSubmitReview,
	submittingReview = false,
}) {
	if (!booking) return null;
	const [ratingInput, setRatingInput] = useState("5");
	const [commentInput, setCommentInput] = useState("");
	const [reviewError, setReviewError] = useState("");
	const [reviewTouched, setReviewTouched] = useState(false);
	const route = booking.schedule?.route;
	const bus = booking.schedule?.bus;
	const state = normalizeBookingState(booking);

	const seatLabels = Array.isArray(booking?.seats) ? booking.seats : [];
	const seatCount = seatLabels.length;

	const totalPrice = useMemo(() => {
		const explicit = Number(booking?.totalPrice);
		if (Number.isFinite(explicit) && explicit >= 0) return explicit;

		const schedulePrice = Number(booking?.schedule?.price);
		if (Number.isFinite(schedulePrice) && schedulePrice >= 0) {
			return seatCount > 0 ? schedulePrice * seatCount : schedulePrice;
		}

		return 0;
	}, [booking?.schedule?.price, booking?.totalPrice, seatCount]);

	const onOpenTicketInNewTab = () => {
		if (!booking?._id) return;

		const targetPath = `/ticket/${booking._id}`;
		const newTab = window.open(targetPath, "_blank", "noopener,noreferrer");
		if (!newTab) {
			window.location.assign(targetPath);
		}
	};

	const onRetryClick = () => {
		if (typeof onRetryPayment !== "function") return;
		onRetryPayment(booking?._id);
	};

	const statusClass = statusClassByKey[state.classKey] || "border-slate-300 bg-slate-100 text-slate-700";
	const dateLabel = formatDateLabel(booking?.schedule?.date);
	const timeLabel = String(booking?.schedule?.time || "Time N/A").trim() || "Time N/A";
	const boardingName = String(booking?.boardingPoint?.name || "N/A").trim() || "N/A";
	const droppingName = String(booking?.droppingPoint?.name || "N/A").trim() || "N/A";

	const lockExpiresAtMs = new Date(booking?.lockExpiresAt || 0).getTime();
	const hasActiveLock = Number.isFinite(lockExpiresAtMs) && lockExpiresAtMs > nowMs;
	const lockRemainingMs = hasActiveLock ? lockExpiresAtMs - nowMs : 0;
	const showPendingTimer = state.bookingStatus === "pending";
	const canRetryPayment = Boolean(booking?.retryEligible) && hasActiveLock && state.bookingStatus === "pending";
	const paymentButtonLabel = retrying ? "Redirecting..." : "Pay Now";

	useEffect(() => {
		if (review) {
			setCommentInput("");
			setReviewError("");
			setReviewTouched(false);
		}
	}, [review]);

	const onSubmitReviewClick = async () => {
		setReviewTouched(true);
		setReviewError("");

		if (typeof onSubmitReview !== "function") return;

		const bookingId = String(booking?._id || "").trim();
		const busId = String(booking?.schedule?.bus?._id || "").trim();
		const rating = Number(ratingInput);

		if (!bookingId || !busId) {
			setReviewError("Booking details are incomplete for review submission.");
			return;
		}

		if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
			setReviewError("Please select a rating between 1 and 5.");
			return;
		}

		try {
			await onSubmitReview({
				bookingId,
				busId,
				rating,
				comment: commentInput,
			});
			setCommentInput("");
		} catch (error) {
			setReviewError(error?.message || "Could not submit review.");
		}
	};

	return (
		<motion.article
			initial={{ opacity: 0, y: 6 }}
			animate={{ opacity: 1, y: 0 }}
			whileHover={{ y: -2 }}
			transition={{ duration: 0.22 }}
			className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow hover:shadow-md"
		>
			<div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-[1fr_auto] lg:items-start">
				<div className="space-y-3">
					<div className="flex flex-wrap items-center gap-2">
						<p className="inline-flex items-center gap-2 text-lg font-bold text-slate-900">
							<BusFront className="h-5 w-5 text-violet-600" />
							{route?.source || "Source"} -&gt; {route?.destination || "Destination"}
						</p>
						<span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusClass}`}>
							{state.label}
						</span>
						{showPendingTimer ? (
							<span
								className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${
									hasActiveLock
										? "border-amber-200 bg-amber-50 text-amber-700"
										: "border-rose-200 bg-rose-50 text-rose-700"
								}`}
							>
								{hasActiveLock ? `Hold ${formatCountdown(lockRemainingMs)}` : "Hold expired"}
							</span>
						) : null}
					</div>

					<div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
						<p className="inline-flex items-center gap-2">
							<CalendarDays className="h-4 w-4 text-violet-600" />
							{dateLabel}
						</p>
						<p className="inline-flex items-center gap-2">
							<Clock3 className="h-4 w-4 text-violet-600" />
							{timeLabel}
						</p>
						<p className="inline-flex items-center gap-2 sm:col-span-2">
							<Ticket className="h-4 w-4 text-violet-600" />
							Bus: {String(bus?.name || "N/A").trim() || "N/A"}
						</p>
					</div>

					<div className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-2">
						<div>
							<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Seats</p>
							<p className="mt-0.5 font-semibold text-slate-800">{seatLabels.length > 0 ? seatLabels.join(", ") : "N/A"}</p>
						</div>
						<div>
							<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Passengers</p>
							<p className="mt-0.5 font-semibold text-slate-800">{seatCount || 1}</p>
						</div>
						<div>
							<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Boarding</p>
							<p className="mt-0.5 inline-flex items-center gap-1.5 font-semibold text-slate-800">
								<MapPin className="h-3.5 w-3.5 text-violet-600" />
								{boardingName}
							</p>
						</div>
						<div>
							<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Dropping</p>
							<p className="mt-0.5 inline-flex items-center gap-1.5 font-semibold text-slate-800">
								<MapPin className="h-3.5 w-3.5 text-violet-600" />
								{droppingName}
							</p>
						</div>
					</div>

					{review ? (
						<div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
							<p className="inline-flex items-center gap-1.5 font-semibold">
								<Star className="h-4 w-4 fill-amber-400 text-amber-500" />
								Your rating: {Number(review.rating || 0).toFixed(1)} / 5
							</p>
							{String(review.comment || "").trim() ? (
								<p className="mt-1 text-xs text-amber-900">{String(review.comment || "").trim()}</p>
							) : null}
						</div>
					) : null}

					{!review && canReview ? (
						<div className="rounded-xl border border-violet-200 bg-violet-50/70 p-3">
							<p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Rate this trip</p>
							<div className="mt-2 grid gap-2 sm:grid-cols-[120px_1fr_auto] sm:items-center">
								<select
									value={ratingInput}
									onChange={(event) => setRatingInput(event.target.value)}
									className="h-9 rounded-lg border border-violet-200 bg-white px-2 text-sm text-slate-700 outline-none focus:border-violet-300"
								>
									<option value="5">5 - Excellent</option>
									<option value="4">4 - Very Good</option>
									<option value="3">3 - Good</option>
									<option value="2">2 - Fair</option>
									<option value="1">1 - Poor</option>
								</select>
								<input
									type="text"
									value={commentInput}
									onChange={(event) => setCommentInput(event.target.value)}
									maxLength={500}
									placeholder="Share your experience (optional)"
									className="h-9 rounded-lg border border-violet-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-violet-300"
								/>
								<button
									type="button"
									onClick={onSubmitReviewClick}
									disabled={submittingReview}
									className="rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:opacity-70"
								>
									{submittingReview ? "Submitting..." : "Submit"}
								</button>
							</div>
							{reviewTouched && reviewError ? (
								<p className="mt-2 text-xs text-rose-600">{reviewError}</p>
							) : null}
						</div>
					) : null}
				</div>

				<div className="flex min-w-48 flex-row items-end justify-between gap-3 sm:flex-col sm:items-end">
					<div className="text-right">
						<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total Fare</p>
						<p className="bg-linear-to-r from-violet-600 to-purple-700 bg-clip-text text-2xl font-extrabold text-transparent">
							{formatCurrency(totalPrice)}
						</p>
					</div>

					<div className="flex flex-wrap justify-end gap-2">
						{canRetryPayment ? (
							<motion.button
								type="button"
								onClick={onRetryClick}
								disabled={retrying}
								whileHover={{ y: -1, scale: 1.01 }}
								whileTap={{ scale: 0.98 }}
								className="rounded-lg bg-linear-to-r from-amber-500 to-orange-600 px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(249,115,22,0.3)] transition hover:from-amber-600 hover:to-orange-700 disabled:opacity-65"
							>
								{paymentButtonLabel}
							</motion.button>
						) : null}

						{state.bookingStatus === "confirmed" ? (
							<motion.button
								type="button"
								onClick={onOpenTicketInNewTab}
								whileHover={{ y: -1, scale: 1.01 }}
								whileTap={{ scale: 0.98 }}
								className="rounded-lg bg-linear-to-r from-violet-600 to-purple-700 px-3 py-2 text-xs font-semibold text-white shadow-[0_10px_24px_rgba(124,58,237,0.32)] transition hover:from-violet-700 hover:to-purple-800 disabled:opacity-65"
							>
								Open E-Ticket
							</motion.button>
						) : null}
					</div>
				</div>
			</div>
		</motion.article>
	);
}
