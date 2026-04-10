// Page for selecting seats on a bus and completing the booking process
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import SeatMap from "../../components/SeatMap";
import { getSeatStatus, initiateEsewaPayment, lockSeats, unlockSeats } from "../../services/booking.service";
import { useAuth } from "../../context/AuthContext";
import { formatCurrency, toAbsoluteAssetUrl } from "../../utils/helpers";

const validatePassenger = ({ name, age, gender, phone }) => {
	const normalizedName = String(name || "").trim();
	const normalizedGender = String(gender || "").trim().toLowerCase();
	const numericAge = Number(age);
	const digits = String(phone || "").replace(/\D/g, "");

	if (!normalizedName) return { ok: false, message: "Passenger name is required" };
	if (!Number.isFinite(numericAge) || numericAge < 1 || numericAge > 120) return { ok: false, message: "Enter a valid age" };
	if (!["male", "female", "other"].includes(normalizedGender)) return { ok: false, message: "Select a gender" };
	if (digits.length < 7) return { ok: false, message: "Enter a valid phone number" };
	return { ok: true };
};

const stopKey = (s) => String(s || "").trim().toLowerCase();

const toStopName = (raw) => {
	if (raw === null || raw === undefined) return "";
	if (typeof raw === "string") return raw;
	if (typeof raw === "object") return raw.name;
	return "";
};

const parseIsoDateTimeMs = (date, time) => {
	const d = String(date || "").trim();
	const t = String(time || "").trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(t)) return NaN;
	return new Date(`${d}T${t}:00`).getTime();
};

const normalizeSeatNumbers = (seats) => {
	if (!Array.isArray(seats)) return [];
	const parsed = seats
		.map((s) => Number(s))
		.filter((n) => Number.isInteger(n) && n > 0);
	return Array.from(new Set(parsed)).sort((a, b) => a - b);
};

export default function BookingPage() {
	const { scheduleId } = useParams();
	const navigate = useNavigate();
	const location = useLocation();
	const { currentUser } = useAuth();
	const [seatStatus, setSeatStatus] = useState(null);
	const [selectedSeats, setSelectedSeats] = useState([]);
	const [loadError, setLoadError] = useState("");
	const [loading, setLoading] = useState(true);
	const [actionLoading, setActionLoading] = useState(false);
	const [toast, setToast] = useState(null);
	const toastTimerRef = useRef(null);

	const [passengerName, setPassengerName] = useState("");
	const [passengerAge, setPassengerAge] = useState("");
	const [passengerGender, setPassengerGender] = useState("");
	const [passengerPhone, setPassengerPhone] = useState("");
	const [boardingPoint, setBoardingPoint] = useState("");
	const [droppingPoint, setDroppingPoint] = useState("");

	const redirectToLogin = (nextSelectedSeats = selectedSeats) => {
		try {
			const payload = {
				scheduleId,
				selectedSeats: nextSelectedSeats,
				boardingPoint,
				droppingPoint,
				passenger: {
					name: passengerName,
					age: passengerAge,
					gender: passengerGender,
					phone: passengerPhone,
				},
			};
			sessionStorage.setItem("pendingBooking", JSON.stringify(payload));
		} catch {
			// ignore storage errors
		}
		const redirectPath = `${location.pathname || ""}${location.search || ""}`;
		navigate(`/login?redirect=${encodeURIComponent(redirectPath || `/seats/${scheduleId}`)}`);
	};

	const showToast = (kind, text) => {
		setToast({ kind, text, id: Date.now() });
		if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
		toastTimerRef.current = window.setTimeout(() => setToast(null), 3500);
	};

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

	const refresh = async ({ silent = false } = {}) => {
		if (!silent) setLoading(true);
		if (!silent) setLoadError("");
		try {
			const data = await getSeatStatus(scheduleId);
			setSeatStatus(data);

			// Keep the UI selection aligned with server-side locks for this user.
			if (currentUser?.id) {
				const locks = Array.isArray(data?.lockedSeats) ? data.lockedSeats : [];
				const mine = normalizeSeatNumbers(
					locks
						.filter((l) => String(l?.lockedBy?._id ?? l.lockedBy) === String(currentUser.id))
						.map((l) => l.seatNumber)
				);
				setSelectedSeats(mine);
			}
			return data;
		} catch (err) {
			const msg = err?.response?.data?.message || err.message || "Failed to load seat status";
			if (!silent) setLoadError(msg);
			else showToast("error", msg);
			return null;
		} finally {
			if (!silent) setLoading(false);
		}
	};

	useEffect(() => {
		refresh();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [scheduleId]);

	useEffect(() => {
		if (!currentUser?.id) return;
		try {
			const raw = sessionStorage.getItem("pendingBooking");
			if (!raw) return;
			const pending = JSON.parse(raw);
			if (!pending || String(pending.scheduleId) !== String(scheduleId)) return;
			if (Array.isArray(pending.selectedSeats) && pending.selectedSeats.length > 0) {
				setSelectedSeats(normalizeSeatNumbers(pending.selectedSeats));
			}
			const p = pending.passenger || {};
			if (p.name) setPassengerName(String(p.name));
			if (p.age !== undefined) setPassengerAge(String(p.age));
			if (p.gender) setPassengerGender(String(p.gender));
			if (p.phone) setPassengerPhone(String(p.phone));
			if (pending.boardingPoint) setBoardingPoint(String(pending.boardingPoint));
			if (pending.droppingPoint) setDroppingPoint(String(pending.droppingPoint));
			sessionStorage.removeItem("pendingBooking");
			showToast("success", "Login successful. Continue your booking.");
		} catch {
			// ignore
		}
		// run when user becomes available
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [currentUser?.id, scheduleId]);

	const toggleSeat = async (seatNumber) => {
		if (actionLoading) return;
		const isSelected = selectedSeats.includes(seatNumber);

		if (!currentUser?.id) {
			const next = isSelected
				? selectedSeats.filter((s) => s !== seatNumber)
				: Array.from(new Set([...selectedSeats, seatNumber]));
			redirectToLogin(next);
			return;
		}

		// Optimistic UI update.
		setSelectedSeats((prev) => (prev.includes(seatNumber) ? prev.filter((s) => s !== seatNumber) : [...prev, seatNumber]));
		setActionLoading(true);
		try {
			if (isSelected) {
				await unlockSeats({ scheduleId, seats: [seatNumber] });
			} else {
				await lockSeats({ scheduleId, seats: [seatNumber] });
			}
			await refresh({ silent: true });
		} catch (err) {
			showToast("error", err?.response?.data?.message || err.message || (isSelected ? "Unlock failed" : "Lock failed"));
			await refresh({ silent: true });
		} finally {
			setActionLoading(false);
		}
	};

	const schedule = seatStatus?.schedule;
	const routeStops = useMemo(() => {
		const r = schedule?.route;
		const src = String(r?.source || "").trim();
		const dst = String(r?.destination || "").trim();
		const midsRaw = Array.isArray(r?.stops) ? r.stops : [];
		const mids = midsRaw.map((s) => String(toStopName(s) || "").trim()).filter(Boolean);
		const list = [src, ...mids, dst].map((s) => String(s || "").trim()).filter(Boolean);
		const seen = new Set();
		return list.filter((s) => {
			const k = stopKey(s);
			if (!k) return false;
			if (seen.has(k)) return false;
			seen.add(k);
			return true;
		});
	}, [schedule?.route]);
	const stopIndexByKey = useMemo(() => {
		const map = new Map();
		routeStops.forEach((s, idx) => {
			const k = stopKey(s);
			if (!k) return;
			if (!map.has(k)) map.set(k, idx);
		});
		return map;
	}, [routeStops]);
	const boardingOptions = useMemo(() => {
		const arr = Array.isArray(schedule?.boardingPoints) ? schedule.boardingPoints : [];
		return arr
			.map((p) => ({
				name: String(p?.name || "").trim(),
				date: String(p?.date || "").trim(),
				time: String(p?.time || "").trim(),
			}))
			.filter((p) => p.name)
			.map((p) => ({ ...p, idx: stopIndexByKey.get(stopKey(p.name)) }))
			.filter((p) => p.idx !== undefined)
			.sort((a, b) => a.idx - b.idx);
	}, [schedule?.boardingPoints, stopIndexByKey]);
	const droppingOptions = useMemo(() => {
		const arr = Array.isArray(schedule?.droppingPoints) ? schedule.droppingPoints : [];
		return arr
			.map((p) => ({
				name: String(p?.name || "").trim(),
				date: String(p?.date || "").trim(),
				time: String(p?.time || "").trim(),
			}))
			.filter((p) => p.name)
			.map((p) => ({ ...p, idx: stopIndexByKey.get(stopKey(p.name)) }))
			.filter((p) => p.idx !== undefined)
			.sort((a, b) => a.idx - b.idx);
	}, [schedule?.droppingPoints, stopIndexByKey]);
	const selectedBoarding = useMemo(() => {
		const k = stopKey(boardingPoint);
		return boardingOptions.find((p) => stopKey(p.name) === k) || null;
	}, [boardingPoint, boardingOptions]);
	const selectedDropping = useMemo(() => {
		const k = stopKey(droppingPoint);
		return droppingOptions.find((p) => stopKey(p.name) === k) || null;
	}, [droppingPoint, droppingOptions]);
	const validDroppingOptions = useMemo(() => {
		const bIdx = selectedBoarding?.idx;
		if (bIdx === undefined) return droppingOptions;
		return droppingOptions.filter((p) => p.idx > bIdx);
	}, [droppingOptions, selectedBoarding?.idx]);

	useEffect(() => {
		if (!droppingPoint) return;
		const k = stopKey(droppingPoint);
		if (!validDroppingOptions.some((p) => stopKey(p.name) === k)) {
			setDroppingPoint("");
		}
	}, [droppingPoint, validDroppingOptions]);
	const busImg = schedule?.bus?.imageUrl ? toAbsoluteAssetUrl(schedule.bus.imageUrl) : "";
	const busImages = busImg ? [busImg, busImg, busImg] : [];
	const pricePerSeat = Number.isFinite(Number(schedule?.price)) ? Number(schedule.price) : 0;
	const totalPrice = pricePerSeat * selectedSeats.length;
	const durationText = useMemo(() => {
		const minutes = Number(schedule?.durationMinutes);
		if (!Number.isFinite(minutes) || minutes <= 0) return "—";
		const h = Math.floor(minutes / 60);
		const m = minutes % 60;
		if (h && m) return `${h}h ${m}m`;
		if (h) return `${h}h`;
		return `${m}m`;
	}, [schedule?.durationMinutes]);

	const myLockedSet = useMemo(() => {
		const locks = Array.isArray(seatStatus?.lockedSeats) ? seatStatus.lockedSeats : [];
		const mine = locks
			.filter((l) => String(l?.lockedBy?._id ?? l.lockedBy) === String(currentUser?.id))
			.map((l) => l.seatNumber);
		return new Set(normalizeSeatNumbers(mine));
	}, [seatStatus?.lockedSeats, currentUser?.id]);

	const allSelectedLockedByMe = useMemo(() => selectedSeats.length > 0 && selectedSeats.every((n) => myLockedSet.has(n)), [selectedSeats, myLockedSet]);

	const passenger = useMemo(
		() => ({ name: passengerName, age: passengerAge, gender: passengerGender, phone: passengerPhone }),
		[passengerName, passengerAge, passengerGender, passengerPhone]
	);
	const passengerValidation = useMemo(() => validatePassenger(passenger), [passenger]);

	const onConfirm = async () => {
		if (selectedSeats.length === 0) {
			showToast("error", "Select at least one seat");
			return;
		}
		if (!selectedBoarding?.name) {
			showToast("error", "Select a boarding point");
			return;
		}
		if (!selectedDropping?.name) {
			showToast("error", "Select a dropping point");
			return;
		}
		if (selectedDropping.idx <= selectedBoarding.idx) {
			showToast("error", "Dropping point must be after boarding point");
			return;
		}
		if (stopKey(selectedDropping.name) === stopKey(selectedBoarding.name)) {
			showToast("error", "Boarding and dropping points must be different");
			return;
		}
		const boardingMs = parseIsoDateTimeMs(selectedBoarding.date, selectedBoarding.time);
		const droppingMs = parseIsoDateTimeMs(selectedDropping.date, selectedDropping.time);
		if (!Number.isFinite(boardingMs) || !Number.isFinite(droppingMs)) {
			showToast("error", "Boarding/dropping times are missing or invalid");
			return;
		}
		if (droppingMs <= boardingMs) {
			showToast("error", "Dropping time must be after boarding time");
			return;
		}
		if (!currentUser?.id) {
			redirectToLogin(selectedSeats);
			return;
		}
		if (!passengerValidation.ok) {
			showToast("error", passengerValidation.message || "Passenger details are required");
			return;
		}

		setActionLoading(true);
		try {
			if (!allSelectedLockedByMe) {
				const missing = selectedSeats.filter((s) => !myLockedSet.has(s));
				if (missing.length > 0) {
					await lockSeats({ scheduleId, seats: missing });
					await refresh({ silent: true });
				}
			}

			const payment = await initiateEsewaPayment({
				scheduleId,
				seats: selectedSeats,
				boardingPoint: selectedBoarding.name,
				droppingPoint: selectedDropping.name,
				passenger: {
					name: String(passengerName || "").trim(),
					age: Number(passengerAge),
					gender: String(passengerGender || "").toLowerCase(),
					phone: String(passengerPhone || "").trim(),
				},
			});
			showToast("success", "Redirecting to eSewa for payment...");
			submitEsewaForm(payment.formUrl, payment.fields);
		} catch (err) {
			if (err?.response?.status === 401) {
				redirectToLogin();
				return;
			}
			showToast("error", err?.response?.data?.message || err.message || "Booking failed");
		} finally {
			setActionLoading(false);
		}
	};

	useEffect(() => {
		return () => {
			if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
		};
	}, []);

	const onProceed = async () => {
		if (selectedSeats.length === 0) {
			showToast("error", "Select at least one seat");
			return;
		}
		if (!currentUser?.id) {
			redirectToLogin(selectedSeats);
			return;
		}
		await onConfirm();
	};

	if (loading) {
		return (
			<div className="min-h-screen bg-linear-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-sm text-slate-200">
				Loading...
			</div>
		);
	}
	if (loadError && !seatStatus) {
		return (
			<div className="min-h-screen bg-linear-to-b from-slate-950 via-slate-900 to-slate-950 px-4 py-10 text-sm text-rose-200">
				{loadError}
			</div>
		);
	}

	return (
		<div className="min-h-screen bg-linear-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100">
			{/* Toast */}
			{toast ? (
				<div
					key={toast.id}
					className={`fixed right-4 top-4 z-50 max-w-[92vw] rounded-2xl px-4 py-3 text-sm shadow-lg ring-1 backdrop-blur ${
						toast.kind === "success"
							? "bg-emerald-950/70 text-emerald-100 ring-emerald-900/60"
							: toast.kind === "error"
								? "bg-rose-950/70 text-rose-100 ring-rose-900/60"
								: "bg-slate-950/70 text-slate-100 ring-slate-800"
					}`}
				>
					{toast.text}
				</div>
			) : null}

			<div className="mx-auto max-w-6xl px-4 py-8">
				<div>
					<Link to="/search" className="text-sm font-semibold text-slate-300 hover:text-slate-100">
						← Back to Search
					</Link>
				</div>

				<div className="mt-4">
					<div className="text-2xl font-extrabold text-slate-100">{schedule?.bus?.name || "Seats"}</div>
					<div className="mt-1 text-sm text-slate-300">Select your seats</div>
					{schedule ? (
						<div className="mt-1 text-xs text-slate-400">
							{schedule.route?.source} → {schedule.route?.destination} • {schedule.date} • {schedule.time}
						</div>
					) : null}
				</div>

				<div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1fr),360px]">
				{/* Left: seat map */}
				<div className="flex flex-col rounded-2xl border border-slate-700/50 bg-slate-900/40 p-5 shadow-sm backdrop-blur sm:p-6">
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div>
							<div className="text-sm font-semibold text-slate-100">Select Seats</div>
							<div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-300">
								<span className="inline-flex items-center gap-2">
									<span className="h-3 w-3 rounded bg-slate-700 ring-1 ring-slate-600" /> Available
								</span>
								<span className="inline-flex items-center gap-2">
									<span className="h-3 w-3 rounded bg-emerald-500" /> Selected
								</span>
								<span className="inline-flex items-center gap-2">
									<span className="h-3 w-3 rounded bg-slate-950/60 ring-1 ring-slate-800" /> Booked
								</span>
							</div>
						</div>
						<div className="text-xs text-slate-300">
							Selected: <span className="font-semibold text-slate-100">{selectedSeats.length ? selectedSeats.join(", ") : "None"}</span>
						</div>
					</div>

					<div className="mt-6 flex flex-1 items-center justify-center">
						<SeatMap
							totalSeats={seatStatus?.totalSeats || 0}
							bookedSeats={seatStatus?.bookedSeats || []}
							lockedSeats={seatStatus?.lockedSeats || []}
							selectedSeats={selectedSeats}
							myUserId={currentUser?.id}
							onToggleSeat={toggleSeat}
							showLegend={false}
						/>
					</div>
				</div>

				{/* Right: trip + passenger details */}
				<div className="flex flex-col rounded-2xl border border-slate-700/50 bg-slate-900/40 p-5 shadow-sm backdrop-blur sm:p-6">
					<div className="text-sm font-semibold text-slate-100">Bus Details</div>

					<div className="mt-4 flex flex-wrap gap-2">
						{busImages.length ? (
							busImages.map((src, idx) => (
								<div key={idx} className="h-14 w-20 overflow-hidden rounded-xl bg-slate-950/40 ring-1 ring-slate-800 sm:h-16 sm:w-24">
									<img
										src={src}
										alt={schedule?.bus?.name || "Bus"}
										loading="lazy"
										decoding="async"
										className="h-full w-full object-cover"
									/>
								</div>
							))
						) : (
							<div className="flex h-14 w-20 items-center justify-center rounded-xl bg-slate-950/40 text-xs text-slate-500 ring-1 ring-slate-800 sm:h-16 sm:w-24">
								No image
							</div>
						)}
					</div>

					<div className="my-5 h-px bg-slate-700/50" />

					<div>
						<div className="text-xs text-slate-400">Bus type</div>
						<div className="mt-1 text-sm font-semibold text-slate-100">{schedule?.bus?.type || "—"}</div>
						{schedule?.bus?.vehicleNumber ? (
							<div className="mt-1 text-xs text-slate-400">Vehicle: {schedule.bus.vehicleNumber}</div>
						) : null}
					</div>

					<div className="my-5 h-px bg-slate-700/50" />

					<div className="grid grid-cols-3 items-end gap-3">
						<div>
							<div className="text-xs text-slate-400">Departure</div>
							<div className="mt-1 text-sm font-extrabold text-slate-100">{schedule?.time || "—"}</div>
						</div>
						<div className="text-center">
							<div className="text-xs text-slate-400">Duration</div>
							<div className="mt-1 text-xs font-semibold text-slate-200">{durationText}</div>
						</div>
						<div className="text-right">
							<div className="text-xs text-slate-400">Arrival</div>
							<div className="mt-1 text-sm font-extrabold text-slate-100">{schedule?.arrivalTime || "—"}</div>
						</div>
					</div>

					{Array.isArray(schedule?.amenities) && schedule.amenities.length > 0 ? (
						<>
							<div className="my-5 h-px bg-slate-700/50" />
							<div>
								<div className="text-xs font-semibold text-slate-300">Amenities</div>
								<div className="mt-3 flex flex-wrap gap-2 text-xs">
									{schedule.amenities.map((a) => (
										<span key={a} className="rounded-full bg-slate-950/30 px-2 py-1 font-semibold text-slate-200 ring-1 ring-slate-800">
											{a}
										</span>
									))}
								</div>
							</div>
						</>
					) : null}

					<div className="my-5 h-px bg-slate-700/50" />

					<div>
						<div className="flex items-center justify-between gap-3">
							<div className="text-xs font-semibold text-slate-300">Selected Seats ({selectedSeats.length})</div>
							<div className="text-xs text-slate-400">Price / seat: {formatCurrency(pricePerSeat)}</div>
						</div>
						{selectedSeats.length ? (
							<div className="mt-3 flex flex-wrap gap-2">
								{selectedSeats.map((n) => (
									<span key={n} className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-200 ring-1 ring-emerald-500/30">
										Seat {n}
									</span>
								))}
							</div>
						) : (
							<div className="mt-2 text-xs text-slate-400">No seats selected</div>
						)}
					</div>

					<div className="my-5 h-px bg-slate-700/50" />

					<div>
						<div className="text-xs font-semibold text-slate-300">Passenger</div>
						<div className="mt-3 grid gap-3">
							<div>
								<div className="text-xs font-semibold text-slate-300">Pickup & Drop</div>
								<div className="mt-3 grid gap-3">
									<div>
										<label className="block text-[11px] font-semibold text-slate-400">Boarding point</label>
										<div className="mt-2 max-h-40 overflow-y-auto rounded-xl border border-slate-700/60 bg-slate-950/20 p-2">
											{boardingOptions.length ? (
												<div className="grid gap-2">
													{boardingOptions.map((p) => {
														const active = stopKey(p.name) === stopKey(boardingPoint);
														const isStart = stopKey(p.name) === stopKey(schedule?.route?.source);
														return (
															<button
																key={p.name}
																type="button"
																onClick={() => setBoardingPoint(p.name)}
																className={`w-full rounded-xl border px-3 py-2 text-left text-sm shadow-sm outline-none transition ${
																active
																	? "border-emerald-500/40 bg-emerald-500/10"
																	: "border-slate-700/60 bg-slate-950/30 hover:bg-slate-950/50"
															}`}
															>
																<div className="flex items-start justify-between gap-3">
																	<div className="font-semibold text-slate-100">{p.name}</div>
																	<div className="text-[11px] font-semibold text-slate-300">
																		{[p.date, p.time].filter(Boolean).join(" • ")}
																	</div>
																</div>
																{isStart ? <div className="mt-1 text-[11px] font-semibold text-emerald-200">Start</div> : null}
															</button>
														);
													})}
												</div>
											) : (
												<div className="px-2 py-2 text-xs text-slate-400">No boarding points configured for this trip.</div>
											)}
										</div>
									</div>

									<div>
										<label className="block text-[11px] font-semibold text-slate-400">Dropping point</label>
										<div className="mt-2 max-h-44 overflow-y-auto rounded-xl border border-slate-700/60 bg-slate-950/20 p-2">
											{validDroppingOptions.length ? (
												<div className="grid gap-2">
													{validDroppingOptions.map((p) => {
														const active = stopKey(p.name) === stopKey(droppingPoint);
														const isFinal = stopKey(p.name) === stopKey(schedule?.route?.destination);
														return (
															<button
																key={p.name}
																type="button"
																onClick={() => setDroppingPoint(p.name)}
																className={`w-full rounded-xl border px-3 py-2 text-left text-sm shadow-sm outline-none transition ${
																active
																	? "border-emerald-500/40 bg-emerald-500/10"
																	: "border-slate-700/60 bg-slate-950/30 hover:bg-slate-950/50"
															}`}
															>
																<div className="flex items-start justify-between gap-3">
																	<div className="font-semibold text-slate-100">{p.name}</div>
																	<div className="text-[11px] font-semibold text-slate-300">
																		{[p.date, p.time].filter(Boolean).join(" • ")}
																	</div>
																</div>
																{isFinal ? <div className="mt-1 text-[11px] font-semibold text-emerald-200">Final stop</div> : null}
															</button>
														);
													})}
												</div>
											) : selectedBoarding?.name ? (
												<div className="px-2 py-2 text-xs text-slate-400">No valid drop points after the selected boarding stop.</div>
											) : (
												<div className="px-2 py-2 text-xs text-slate-400">Select a boarding point first.</div>
											)}
										</div>
									</div>
								</div>
							</div>

							<div>
								<label className="block text-[11px] font-semibold text-slate-400">Name</label>
								<input
									value={passengerName}
									onChange={(e) => setPassengerName(e.target.value)}
									placeholder="Passenger full name"
									className="mt-2 w-full rounded-xl border border-slate-700/60 bg-slate-950/30 px-3 py-2.5 text-sm text-slate-100 shadow-sm outline-none focus:border-slate-600 focus:ring-2 focus:ring-emerald-300/20"
								/>
							</div>
							<div className="grid grid-cols-2 gap-3">
								<div>
									<label className="block text-[11px] font-semibold text-slate-400">Age</label>
									<input
										type="number"
										min={1}
										max={120}
										value={passengerAge}
										onChange={(e) => setPassengerAge(e.target.value)}
										placeholder="e.g., 28"
										className="mt-2 w-full rounded-xl border border-slate-700/60 bg-slate-950/30 px-3 py-2.5 text-sm text-slate-100 shadow-sm outline-none focus:border-slate-600 focus:ring-2 focus:ring-emerald-300/20"
									/>
								</div>
								<div>
									<label className="block text-[11px] font-semibold text-slate-400">Gender</label>
									<select
										value={passengerGender}
										onChange={(e) => setPassengerGender(e.target.value)}
										className="mt-2 w-full rounded-xl border border-slate-700/60 bg-slate-950/30 px-3 py-2.5 text-sm text-slate-100 shadow-sm outline-none focus:border-slate-600 focus:ring-2 focus:ring-emerald-300/20"
									>
										<option value="">Select</option>
										<option value="male">Male</option>
										<option value="female">Female</option>
										<option value="other">Other</option>
									</select>
								</div>
							</div>
							<div>
								<label className="block text-[11px] font-semibold text-slate-400">Phone</label>
								<input
									value={passengerPhone}
									onChange={(e) => setPassengerPhone(e.target.value)}
									placeholder="e.g., 98xxxxxxxx"
									className="mt-2 w-full rounded-xl border border-slate-700/60 bg-slate-950/30 px-3 py-2.5 text-sm text-slate-100 shadow-sm outline-none focus:border-slate-600 focus:ring-2 focus:ring-emerald-300/20"
								/>
								<p className="mt-2 text-[11px] text-slate-400">Your details are required for the ticket.</p>
							</div>
						</div>
					</div>

					<div className="my-5 h-px bg-slate-700/50" />

					<div className="space-y-3 text-sm">
						<div className="flex items-center justify-between">
							<span className="text-slate-300">Selected seats</span>
							<span className="font-semibold text-slate-100">{selectedSeats.length || 0}</span>
						</div>
						<div className="flex items-center justify-between">
							<span className="text-slate-300">Price / seat</span>
							<span className="font-semibold text-slate-100">{formatCurrency(pricePerSeat)}</span>
						</div>
						<div className="flex items-center justify-between">
							<span className="text-slate-300">Total Amount</span>
							<span className="text-base font-extrabold text-emerald-400">{formatCurrency(totalPrice)}</span>
						</div>
						<div className="pt-1 text-xs text-slate-400">Seats are auto-locked for ~10 minutes after selection.</div>
					</div>

					<div className="mt-6 grid gap-3">
						<button
							disabled={actionLoading || selectedSeats.length === 0}
							onClick={onProceed}
							className="inline-flex w-full items-center justify-center rounded-xl bg-slate-100 px-4 py-3 text-sm font-extrabold text-slate-950 shadow-sm hover:bg-white disabled:opacity-60"
						>
							Proceed to Book
						</button>
						<button
							disabled={actionLoading}
							onClick={() => refresh({ silent: true })}
							className="inline-flex w-full items-center justify-center rounded-xl border border-slate-700/60 bg-slate-950/20 px-4 py-2.5 text-sm font-semibold text-slate-100 shadow-sm hover:bg-slate-950/40 disabled:opacity-60"
						>
							Refresh
						</button>
					</div>
				</div>
				</div>
			</div>
		</div>
	);
}
