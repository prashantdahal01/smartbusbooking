// Customer dashboard with bookings, profile, and account settings views
import { motion } from "framer-motion";
import {
	Bell,
	CheckCircle2,
	CircleOff,
	RefreshCw,
	Save,
	Settings2,
	Ticket,
	UserPen,
	WalletCards,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import BookingCard from "../../components/BookingCard";
import { useAuth } from "../../context/AuthContext";
import {
	getMyBookings,
	getMyReviews,
	retryEsewaPayment,
	submitReview,
	verifyEsewaPayment,
} from "../../services/booking.service";
import { getProfile, updateProfile } from "../../services/user.service";
import { formatCurrency } from "../../utils/helpers";

const SETTINGS_KEY = "customer-settings";

const defaultPrefs = {
	tripReminders: true,
	bookingUpdates: true,
	offersNewsletter: false,
};

const VIEW_KEYS = ["bookings", "profile", "settings"];

const getBookingAmount = (booking) => {
	const explicit = Number(booking?.totalPrice);
	if (Number.isFinite(explicit) && explicit >= 0) return explicit;

	const schedulePrice = Number(booking?.schedule?.price);
	if (!Number.isFinite(schedulePrice) || schedulePrice < 0) return 0;

	const seatCount = Array.isArray(booking?.seats) ? booking.seats.length : 0;
	return seatCount > 0 ? schedulePrice * seatCount : schedulePrice;
};

const findPaymentNoticeBookingId = (items, paymentToken) => {
	const now = Date.now();
	const normalizedToken = String(paymentToken || "").trim().toLowerCase();
	const isRecent = (booking) => {
		const ts = new Date(booking?.createdAt || booking?.updatedAt || 0).getTime();
		return Number.isFinite(ts) && now - ts < 30 * 60 * 1000;
	};

	const candidates = (Array.isArray(items) ? items : []).filter(isRecent);
	if (normalizedToken === "success") {
		return candidates.find((booking) => String(booking?.status || "").toLowerCase() === "confirmed")?._id || "";
	}

	if (normalizedToken === "pending") {
		return candidates.find((booking) => String(booking?.paymentStatus || booking?.payment?.status || "").toLowerCase() === "pending")?._id || "";
	}

	if (["failure", "error", "expired"].includes(normalizedToken)) {
		return candidates.find((booking) => String(booking?.paymentStatus || booking?.payment?.status || "").toLowerCase() === "failed")?._id
			|| candidates.find((booking) => String(booking?.status || "").toLowerCase() === "payment_failed")?._id
			|| "";
	}

	return "";
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}$/;

const parseScheduleDateTimeMs = (dateText, timeText) => {
	const safeDate = String(dateText || "").trim();
	if (!DATE_RE.test(safeDate)) return NaN;

	const safeTime = TIME_RE.test(String(timeText || "").trim()) ? String(timeText || "").trim() : "23:59";
	return new Date(`${safeDate}T${safeTime}:00`).getTime();
};

const isBookingCompletedForReview = (booking, nowMs = Date.now()) => {
	const status = String(booking?.status || "").trim().toLowerCase();
	if (status === "completed") return true;
	if (status !== "confirmed") return false;

	const schedule = booking?.schedule || {};
	const completionMs = parseScheduleDateTimeMs(
		schedule?.arrivalDate || schedule?.date,
		schedule?.arrivalTime || schedule?.time
	);

	if (!Number.isFinite(completionMs)) return false;
	return completionMs < nowMs;
};

export default function DashboardPage() {
	const [searchParams, setSearchParams] = useSearchParams();
	const { currentUser, refreshMe } = useAuth();

	const queryView = searchParams.get("view") || "bookings";
	const safeView = VIEW_KEYS.includes(queryView) ? queryView : "bookings";
	const [activeView, setActiveView] = useState(safeView);

	const [bookings, setBookings] = useState([]);
	const [loadingBookings, setLoadingBookings] = useState(false);
	const [bookingError, setBookingError] = useState("");
	const [bookingActionMessage, setBookingActionMessage] = useState(null);
	const [reviewsByBooking, setReviewsByBooking] = useState({});
	const [submittingReviewByBooking, setSubmittingReviewByBooking] = useState({});
	const [retryingBookingId, setRetryingBookingId] = useState("");
	const [bookingNowMs, setBookingNowMs] = useState(() => Date.now());
	const [paymentNotice, setPaymentNotice] = useState(null);
	const [paymentCopyStatus, setPaymentCopyStatus] = useState("");
	const verifyTimerRef = useRef(null);
	const verifyAttemptsRef = useRef(0);
	const verifyingBookingRef = useRef("");

	const [name, setName] = useState("");
	const [phone, setPhone] = useState("");
	const [profileLoading, setProfileLoading] = useState(false);
	const [savingProfile, setSavingProfile] = useState(false);
	const [profileError, setProfileError] = useState("");
	const [profileMessage, setProfileMessage] = useState("");

	const [prefs, setPrefs] = useState(() => {
		try {
			const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
			return { ...defaultPrefs, ...stored };
		} catch {
			return defaultPrefs;
		}
	});

	useEffect(() => {
		if (!VIEW_KEYS.includes(queryView)) {
			setSearchParams({ view: "bookings" }, { replace: true });
			setActiveView("bookings");
			return;
		}

		setActiveView(queryView);
	}, [queryView, setSearchParams]);

	const paymentToken = String(searchParams.get("payment") || "").trim().toLowerCase();
	const paymentBookingId = String(searchParams.get("bookingId") || "").trim();

	useEffect(() => {
		if (activeView !== "bookings") return;
		if (!paymentToken) {
			setPaymentNotice(null);
			return;
		}

		const noticeByToken = {
			success: {
				type: "success",
				title: "Payment successful",
				message: "Your booking is confirmed and your ticket is ready.",
			},
			pending: {
				type: "warning",
				title: "Payment pending",
				message: "Your payment is still processing. We will verify it automatically.",
			},
			failure: {
				type: "error",
				title: "Payment failed",
				message: "We could not confirm the payment. Keep this bookingId to investigate or retry.",
			},
			expired: {
				type: "error",
				title: "Payment expired",
				message: "Seat hold expired before payment completion. Please book again.",
			},
			error: {
				type: "error",
				title: "Payment error",
				message: "A payment error occurred. Please retry or contact support with the bookingId.",
			},
		};

		const nextNotice = noticeByToken[paymentToken] || null;
		setPaymentNotice(nextNotice ? { ...nextNotice, bookingId: paymentBookingId } : null);
		setPaymentCopyStatus("");
		// eslint-disable-next-line no-void
		void loadBookings();
	}, [activeView, paymentToken, paymentBookingId]);

	useEffect(() => {
		if (!paymentNotice || paymentNotice.bookingId || !bookings.length || !paymentToken) return;
		const fallbackId = findPaymentNoticeBookingId(bookings, paymentToken);
		if (!fallbackId) return;
		setPaymentNotice((prev) => (prev ? { ...prev, bookingId: fallbackId } : prev));
	}, [bookings, paymentNotice, paymentToken]);

	useEffect(() => {
		if (activeView !== "bookings") return undefined;
		if (paymentToken !== "pending" || !paymentNotice?.bookingId) return undefined;

		const bookingId = String(paymentNotice.bookingId || "").trim();
		if (!bookingId) return undefined;
		if (verifyingBookingRef.current === bookingId) return undefined;

		verifyingBookingRef.current = bookingId;
		verifyAttemptsRef.current = 0;

		const maxAttempts = 6;
		const intervalMs = 5000;

		const stopPolling = () => {
			if (verifyTimerRef.current) {
				window.clearInterval(verifyTimerRef.current);
				verifyTimerRef.current = null;
			}
			verifyingBookingRef.current = "";
		};

		const runCheck = async () => {
			if (!verifyingBookingRef.current) return;
			verifyAttemptsRef.current += 1;
			try {
				const result = await verifyEsewaPayment({ bookingId });
				const bookingStatus = String(result?.bookingStatus || "").toLowerCase();
				const paymentStatus = String(result?.paymentStatus || "").toLowerCase();
				if (["confirmed", "cancelled"].includes(bookingStatus) || ["paid", "failed"].includes(paymentStatus)) {
					stopPolling();
				}
			} catch {
				if (verifyAttemptsRef.current >= maxAttempts) {
					stopPolling();
				}
			} finally {
				// eslint-disable-next-line no-void
				void loadBookings();
			}

			if (verifyAttemptsRef.current >= maxAttempts) {
				stopPolling();
			}
		};

		void runCheck();
		verifyTimerRef.current = window.setInterval(runCheck, intervalMs);

		return () => {
			stopPolling();
		};
	}, [activeView, paymentNotice?.bookingId, paymentToken]);

	useEffect(() => {
		localStorage.setItem(SETTINGS_KEY, JSON.stringify(prefs));
	}, [prefs]);

	useEffect(() => {
		setName(currentUser?.name || "");
		setPhone(currentUser?.phone || "");
	}, [currentUser?.name, currentUser?.phone]);

	const loadBookings = async () => {
		setLoadingBookings(true);
		setBookingError("");
		try {
			const bookingData = await getMyBookings();
			const safeBookings = Array.isArray(bookingData) ? bookingData : [];
			setBookings(safeBookings);

			try {
				const reviewRows = await getMyReviews();
				const byBooking = {};
				(Array.isArray(reviewRows) ? reviewRows : []).forEach((review) => {
					const bookingId = String(review?.bookingId || "").trim();
					if (!bookingId) return;
					byBooking[bookingId] = review;
				});
				setReviewsByBooking(byBooking);
			} catch {
				setReviewsByBooking({});
			}
		} catch (err) {
			setBookingError(err?.response?.data?.message || err.message || "Failed to load bookings");
		} finally {
			setLoadingBookings(false);
		}
	};

	const onSubmitBookingReview = async ({ bookingId, busId, rating, comment }) => {
		const safeBookingId = String(bookingId || "").trim();
		if (!safeBookingId) {
			throw new Error("Missing bookingId");
		}

		setSubmittingReviewByBooking((prev) => ({ ...prev, [safeBookingId]: true }));

		try {
			const review = await submitReview({ bookingId: safeBookingId, busId, rating, comment });
			setReviewsByBooking((prev) => ({ ...prev, [safeBookingId]: review }));
			return review;
		} catch (error) {
			const message = error?.response?.data?.message || error?.message || "Unable to submit review";
			throw new Error(message);
		} finally {
			setSubmittingReviewByBooking((prev) => ({ ...prev, [safeBookingId]: false }));
		}
	};

	useEffect(() => {
		if (activeView !== "bookings") return;
		// eslint-disable-next-line no-void
		void loadBookings();
	}, [activeView]);

	useEffect(() => {
		if (activeView !== "bookings") return undefined;
		const timer = window.setInterval(() => {
			setBookingNowMs(Date.now());
		}, 1000);

		return () => {
			window.clearInterval(timer);
		};
	}, [activeView]);

	const submitEsewaForm = (formUrl, fields) => {
		if (!formUrl || !fields || typeof fields !== "object") {
			throw new Error("Payment gateway response missing form details");
		}

		const form = document.createElement("form");
		form.method = "POST";
		form.action = String(formUrl);

		Object.entries(fields).forEach(([name, value]) => {
			const input = document.createElement("input");
			input.type = "hidden";
			input.name = String(name);
			input.value = String(value);
			form.appendChild(input);
		});

		document.body.appendChild(form);
		form.submit();
	};

	const onRetryPayment = async (bookingId) => {
		if (!bookingId || retryingBookingId) return;

		setRetryingBookingId(String(bookingId));
		setBookingActionMessage(null);

		try {
			const payment = await retryEsewaPayment({ bookingId });
			setBookingActionMessage({ type: "success", text: "Redirecting to payment gateway..." });
			submitEsewaForm(payment.formUrl, payment.fields);
		} catch (err) {
			const message = err?.response?.data?.message || err?.message || "Unable to retry payment";
			setBookingActionMessage({ type: "error", text: message });
			// eslint-disable-next-line no-void
			void loadBookings();
		} finally {
			setRetryingBookingId("");
		}
	};

	const onCopyPaymentBookingId = async () => {
		if (!paymentNotice?.bookingId) return;
		try {
			await navigator.clipboard.writeText(paymentNotice.bookingId);
			setPaymentCopyStatus("Copied");
			window.setTimeout(() => setPaymentCopyStatus(""), 1500);
		} catch {
			setPaymentCopyStatus("Copy failed");
			window.setTimeout(() => setPaymentCopyStatus(""), 1500);
		}
	};

	const onDismissPaymentNotice = () => {
		setPaymentNotice(null);
		setPaymentCopyStatus("");
		const nextParams = new URLSearchParams(searchParams);
		nextParams.delete("payment");
		nextParams.delete("bookingId");
		if (!nextParams.get("view")) {
			nextParams.set("view", "bookings");
		}
		setSearchParams(nextParams, { replace: true });
	};

	const loadProfile = async () => {
		setProfileLoading(true);
		setProfileError("");
		try {
			const profile = await getProfile();
			setName(profile?.name || "");
			setPhone(profile?.phone || "");
		} catch (err) {
			setProfileError(err?.response?.data?.message || err.message || "Failed to load profile");
		} finally {
			setProfileLoading(false);
		}
	};

	useEffect(() => {
		if (activeView !== "profile") return;
		// eslint-disable-next-line no-void
		void loadProfile();
	}, [activeView]);

	const onSaveProfile = async (event) => {
		event.preventDefault();
		setSavingProfile(true);
		setProfileError("");
		setProfileMessage("");
		try {
			await updateProfile({ name: String(name || "").trim(), phone: String(phone || "").trim() });
			await refreshMe();
			setProfileMessage("Profile updated successfully.");
		} catch (err) {
			setProfileError(err?.response?.data?.message || err.message || "Failed to update profile");
		} finally {
			setSavingProfile(false);
		}
	};

	const tabs = useMemo(
		() => [
			{ key: "bookings", label: "My Bookings", icon: Ticket },
			{ key: "profile", label: "Edit Profile", icon: UserPen },
			{ key: "settings", label: "Account Settings", icon: Settings2 },
		],
		[]
	);

	const bookingStats = useMemo(() => {
		const confirmedCount = bookings.filter((booking) => booking?.status === "confirmed").length;
		const cancelledCount = bookings.filter((booking) => booking?.status === "cancelled").length;
		const totalSpent = bookings
			.filter((booking) => booking?.status === "confirmed")
			.reduce((sum, booking) => sum + getBookingAmount(booking), 0);

		return {
			total: bookings.length,
			confirmed: confirmedCount,
			cancelled: cancelledCount,
			totalSpent,
		};
	}, [bookings]);

	const bookingReviewMeta = useMemo(() => {
		const next = {};
		bookings.forEach((booking) => {
			const bookingId = String(booking?._id || "").trim();
			if (!bookingId) return;

			next[bookingId] = {
				review: reviewsByBooking[bookingId] || null,
				canReview: isBookingCompletedForReview(booking, bookingNowMs),
			};
		});
		return next;
	}, [bookings, bookingNowMs, reviewsByBooking]);

	return (
		<div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
			<div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
				<div className="flex flex-wrap gap-2">
					{tabs.map((tab) => {
						const Icon = tab.icon;
						const active = activeView === tab.key;
						return (
							<button
								key={tab.key}
								type="button"
								onClick={() => setSearchParams({ view: tab.key })}
								className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
									active
										? "bg-violet-600 text-white"
										: "border border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:text-violet-700"
								}`}
							>
								<Icon className="h-4 w-4" />
								{tab.label}
							</button>
						);
					})}
				</div>
			</div>

			{activeView === "bookings" ? (
				<div className="mt-4 space-y-4">
					{paymentNotice ? (
						<div
							className={`rounded-2xl border px-4 py-3 text-sm shadow-sm sm:px-5 sm:py-4 ${
								paymentNotice.type === "success"
									? "border-emerald-200 bg-emerald-50 text-emerald-700"
									: paymentNotice.type === "warning"
										? "border-amber-200 bg-amber-50 text-amber-700"
										: "border-rose-200 bg-rose-50 text-rose-700"
							}`}
						>
							<div className="flex flex-wrap items-start justify-between gap-3">
								<div>
									<p className="text-base font-semibold">{paymentNotice.title}</p>
									<p className="mt-1 text-sm">{paymentNotice.message}</p>
									{paymentNotice.bookingId ? (
										<p className="mt-2 text-xs font-semibold uppercase tracking-wide">
											Booking ID: <span className="normal-case font-semibold">{paymentNotice.bookingId}</span>
										</p>
									) : null}
								</div>

								<div className="flex flex-wrap items-center gap-2">
									{paymentNotice.bookingId ? (
										<button
											type="button"
											onClick={onCopyPaymentBookingId}
											className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400"
										>
											{paymentCopyStatus || "Copy bookingId"}
										</button>
									) : null}
									<button
										type="button"
										onClick={onDismissPaymentNotice}
										className="rounded-lg border border-transparent px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:text-slate-900"
									>
										Dismiss
									</button>
								</div>
							</div>
						</div>
					) : null}
					<div className="rounded-2xl border border-slate-200 bg-linear-to-r from-violet-50 via-white to-purple-50 p-4 shadow-sm sm:p-5">
						<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<h2 className="text-2xl font-extrabold tracking-tight text-slate-900">My Bookings</h2>
								<p className="mt-1 text-sm text-slate-600">Track upcoming trips and manage cancellations in one place.</p>
							</div>

							<motion.button
								type="button"
								onClick={() => {
									// eslint-disable-next-line no-void
									void loadBookings();
								}}
								disabled={loadingBookings}
								whileHover={{ y: -1, scale: 1.01 }}
								whileTap={{ scale: 0.98 }}
								className="inline-flex items-center justify-center gap-2 rounded-xl bg-linear-to-r from-violet-600 to-purple-700 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_12px_26px_rgba(109,40,217,0.3)] transition hover:from-violet-700 hover:to-purple-800 disabled:opacity-70"
							>
								<RefreshCw className={`h-4 w-4 ${loadingBookings ? "animate-spin" : ""}`} />
								{loadingBookings ? "Refreshing..." : "Refresh Bookings"}
							</motion.button>
						</div>

						<div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
							<div className="rounded-xl border border-violet-200 bg-white/90 p-3">
								<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total bookings</p>
								<p className="mt-1 inline-flex items-center gap-2 text-xl font-extrabold text-slate-900">
									<Ticket className="h-5 w-5 text-violet-600" />
									{bookingStats.total}
								</p>
							</div>

							<div className="rounded-xl border border-emerald-200 bg-white/90 p-3">
								<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Confirmed</p>
								<p className="mt-1 inline-flex items-center gap-2 text-xl font-extrabold text-emerald-700">
									<CheckCircle2 className="h-5 w-5" />
									{bookingStats.confirmed}
								</p>
							</div>

							<div className="rounded-xl border border-rose-200 bg-white/90 p-3">
								<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cancelled</p>
								<p className="mt-1 inline-flex items-center gap-2 text-xl font-extrabold text-rose-700">
									<CircleOff className="h-5 w-5" />
									{bookingStats.cancelled}
								</p>
							</div>

							<div className="rounded-xl border border-violet-200 bg-white/90 p-3">
								<p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Total spent</p>
								<p className="mt-1 inline-flex items-center gap-2 text-xl font-extrabold text-violet-700">
									<WalletCards className="h-5 w-5" />
									{formatCurrency(bookingStats.totalSpent)}
								</p>
							</div>
						</div>
					</div>

					{bookingError ? (
						<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{bookingError}</div>
					) : null}

					{bookingActionMessage ? (
						<div
							className={`rounded-xl px-4 py-3 text-sm ${
								bookingActionMessage.type === "success"
									? "border border-emerald-200 bg-emerald-50 text-emerald-700"
									: "border border-rose-200 bg-rose-50 text-rose-700"
							}`}
						>
							{bookingActionMessage.text}
						</div>
					) : null}

					{loadingBookings ? (
						<div className="grid gap-4">
							<div className="skeleton h-44 rounded-2xl" />
							<div className="skeleton h-44 rounded-2xl" />
						</div>
					) : (
						<div className="grid gap-4">
							{bookings.map((booking) => {
								const bookingId = String(booking?._id || "").trim();
								const meta = bookingReviewMeta[bookingId] || { review: null, canReview: false };
								return (
								<BookingCard
									key={booking._id}
									booking={booking}
									nowMs={bookingNowMs}
									onRetryPayment={onRetryPayment}
									retrying={retryingBookingId === String(booking?._id || "")}
									review={meta.review}
									canReview={meta.canReview}
									onSubmitReview={onSubmitBookingReview}
									submittingReview={Boolean(submittingReviewByBooking[bookingId])}
								/>
								);
							})}
						</div>
					)}

					{!loadingBookings && bookings.length === 0 ? (
						<div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
							<Ticket className="mx-auto h-9 w-9 text-violet-500" />
							<h3 className="mt-3 text-lg font-bold text-slate-900">No bookings yet</h3>
							<p className="mt-1 text-sm text-slate-600">Your booked trips will appear here once you complete a reservation.</p>
						</div>
					) : null}
				</div>
			) : null}

			{activeView === "profile" ? (
				<div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
					<h2 className="text-xl font-bold text-slate-900">Edit Profile</h2>
					<p className="mt-1 text-sm text-slate-500">Keep your personal details up to date.</p>

					{profileError ? (
						<div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{profileError}</div>
					) : null}
					{profileMessage ? (
						<div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{profileMessage}</div>
					) : null}

					{profileLoading ? <p className="mt-4 text-sm text-slate-500">Loading profile...</p> : null}

					<form onSubmit={onSaveProfile} className="mt-4 grid gap-4 sm:grid-cols-2">
						<div>
							<label className="text-sm font-medium text-slate-700">Name</label>
							<input
								value={name}
								onChange={(event) => setName(event.target.value)}
								required
								className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
							/>
						</div>

						<div>
							<label className="text-sm font-medium text-slate-700">Phone</label>
							<input
								value={phone}
								onChange={(event) => setPhone(event.target.value)}
								className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-violet-300 focus:ring-2 focus:ring-violet-100"
							/>
						</div>

						<div className="sm:col-span-2">
							<label className="text-sm font-medium text-slate-700">Email</label>
							<input
								value={currentUser?.email || ""}
								readOnly
								className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500"
							/>
						</div>

						<div className="sm:col-span-2">
							<button
								type="submit"
								disabled={savingProfile}
								className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-60"
							>
								<Save className="h-4 w-4" />
								{savingProfile ? "Saving..." : "Save Profile"}
							</button>
						</div>
					</form>
				</div>
			) : null}

			{activeView === "settings" ? (
				<div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
					<h2 className="text-xl font-bold text-slate-900">Account Settings</h2>
					<p className="mt-1 text-sm text-slate-500">Set your notification preferences.</p>

					<div className="mt-4 space-y-3">
						{[
							{ key: "tripReminders", label: "Trip reminders" },
							{ key: "bookingUpdates", label: "Booking status updates" },
							{ key: "offersNewsletter", label: "Offers and newsletter" },
						].map((pref) => (
							<label
								key={pref.key}
								className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
							>
								<span className="inline-flex items-center gap-2">
									<Bell className="h-4 w-4 text-violet-600" />
									{pref.label}
								</span>
								<input
									type="checkbox"
									checked={Boolean(prefs[pref.key])}
									onChange={(event) =>
										setPrefs((prev) => ({
											...prev,
											[pref.key]: event.target.checked,
										}))
									}
									className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
								/>
							</label>
						))}
					</div>
				</div>
			) : null}
		</div>
	);
}
