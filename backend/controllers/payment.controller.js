// Handles eSewa (ePay v2) payment initiation and callback verification
const crypto = require("crypto");

const Booking = require("../models/Booking");
const Schedule = require("../models/Schedule");
const { seatLockService } = require("../algorithms/seatLock");
const { sendTicketEmailSafely } = require("../utils/mailer");
const { createAdminNotification } = require("../services/notification.service");
const { buildRouteOrderIndex } = require("../utils/routePoints");

const DEFAULT_SEAT_PRICE = 0;

const normalizeSeatLabel = (value) => String(value || "").trim().toUpperCase().replace(/\s+/g, "");
const normalizeSeatType = (value) => {
	const normalized = String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
	if (normalized === "SLEEPER") return "SLEEPER";
	if (normalized === "SHARED_SLEEPER") return "SHARED_SLEEPER";
	return "SEATER";
};
const sortSeatLabels = (a, b) => String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });
const toFinitePrice = (value, fallbackValue = DEFAULT_SEAT_PRICE) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallbackValue;
};

const buildSeatQueryValues = (seatLabels) => {
	const values = new Set();
	(Array.isArray(seatLabels) ? seatLabels : []).forEach((label) => {
		values.add(label);
		if (/^\d+$/.test(label)) {
			values.add(Number(label));
		}
	});
	return [...values];
};

const buildSeatCatalog = (bus, fallbackPrice) => {
	const catalog = new Map();
	const rawDecks = Array.isArray(bus?.decks) ? bus.decks : [];

	rawDecks.forEach((deck, deckIdx) => {
		const deckNumber = Number.isFinite(Number(deck?.deckNumber)) && Number(deck.deckNumber) > 0
			? Math.trunc(Number(deck.deckNumber))
			: deckIdx + 1;
		const deckName = String(deck?.name || "").trim() || (deckNumber === 1 ? "Lower Deck" : `Deck ${deckNumber}`);
		const seats = Array.isArray(deck?.seats) ? deck.seats : [];

		seats.forEach((seat) => {
			const seatLabel = normalizeSeatLabel(seat?.seatNumber);
			if (!seatLabel || catalog.has(seatLabel)) return;
			catalog.set(seatLabel, {
				seatLabel,
				seatNumber: String(seat?.seatNumber || seatLabel).trim() || seatLabel,
				deckNumber,
				deckName,
				seatType: normalizeSeatType(seat?.seatType),
				price: toFinitePrice(seat?.price, fallbackPrice),
				isAvailable: seat?.isAvailable !== false,
			});
		});
	});

	if (catalog.size > 0) return catalog;

	const totalSeats = Number.isFinite(Number(bus?.totalSeats)) && Number(bus?.totalSeats) > 0
		? Math.trunc(Number(bus.totalSeats))
		: 0;

	for (let i = 1; i <= totalSeats; i += 1) {
		const seatLabel = String(i);
		catalog.set(seatLabel, {
			seatLabel,
			seatNumber: seatLabel,
			deckNumber: 1,
			deckName: "Main Deck",
			seatType: "SEATER",
			price: toFinitePrice(fallbackPrice),
			isAvailable: true,
		});
	}

	return catalog;
};

const validateSeatSelection = (seatCatalog, seatLabels) => {
	const invalidSeats = [];
	const unavailableSeats = [];

	seatLabels.forEach((seatLabel) => {
		const seat = seatCatalog.get(seatLabel);
		if (!seat) {
			invalidSeats.push(seatLabel);
			return;
		}
		if (seat.isAvailable === false) {
			unavailableSeats.push(seatLabel);
		}
	});

	return { invalidSeats, unavailableSeats };
};

const buildSeatPriceBreakdown = (seatLabels, seatCatalog) => {
	return seatLabels
		.map((seatLabel) => {
			const seat = seatCatalog.get(seatLabel);
			if (!seat) return null;
			return {
				seatLabel,
				deckNumber: seat.deckNumber,
				deckName: seat.deckName,
				seatType: seat.seatType,
				price: toFinitePrice(seat.price),
			};
		})
		.filter(Boolean);
};

const parseSeats = (seats) => {
	if (!Array.isArray(seats) || seats.length === 0) return null;
	const parsed = seats
		.map((seat) => normalizeSeatLabel(seat))
		.filter(Boolean);
	if (parsed.length !== seats.length) return null;
	return [...new Set(parsed)].sort(sortSeatLabels);
};

const parsePassenger = (passenger) => {
	if (!passenger || typeof passenger !== "object") return null;
	const name = String(passenger.name || "").trim();
	const age = Number(passenger.age);
	const gender = String(passenger.gender || "").trim().toLowerCase();
	const phone = String(passenger.phone || "").trim();
	const phoneDigits = phone.replace(/\D/g, "");

	if (!name) return null;
	if (!Number.isFinite(age) || age < 1 || age > 120) return null;
	if (!["male", "female", "other"].includes(gender)) return null;
	if (phoneDigits.length < 7) return null;

	return { name, age, gender, phone };
};

const parsePassengers = ({ passengers, seatLabels, fallbackPassenger }) => {
	const normalizedSeats = (Array.isArray(seatLabels) ? seatLabels : []).map((seat) => normalizeSeatLabel(seat)).filter(Boolean);
	const source = passengers == null ? [] : passengers;

	if (source != null && !Array.isArray(source)) {
		return { ok: false, message: "passengers[] must be an array" };
	}

	const parsed = [];
	for (let index = 0; index < source.length; index += 1) {
		const entry = source[index];
		if (!entry || typeof entry !== "object") {
			return { ok: false, message: "Each passenger in passengers[] must be an object" };
		}

		const base = parsePassenger(entry);
		if (!base) {
			return { ok: false, message: "Each passengers[] item must include name, age, gender, and phone" };
		}

		const seatLabel = normalizeSeatLabel(entry?.seatLabel || normalizedSeats[index] || "");
		const idNumber = String(entry?.idNumber || "").trim();
		parsed.push({
			...base,
			...(seatLabel ? { seatLabel } : {}),
			...(idNumber ? { idNumber } : {}),
		});
	}

	if (parsed.length === 0 && fallbackPassenger) {
		parsed.push({
			...fallbackPassenger,
			...(normalizedSeats[0] ? { seatLabel: normalizedSeats[0] } : {}),
		});
	}

	if (normalizedSeats.length > 0 && parsed.length > normalizedSeats.length) {
		return { ok: false, message: "passengers[] cannot exceed selected seats" };
	}

	const assignedSeats = new Set();
	for (const item of parsed) {
		if (!item.seatLabel) continue;
		if (normalizedSeats.length > 0 && !normalizedSeats.includes(item.seatLabel)) {
			return { ok: false, message: `Passenger seatLabel ${item.seatLabel} is not in selected seats` };
		}
		if (assignedSeats.has(item.seatLabel)) {
			return { ok: false, message: `Duplicate passenger seatLabel ${item.seatLabel} in passengers[]` };
		}
		assignedSeats.add(item.seatLabel);
	}

	const unassignedSeatQueue = normalizedSeats.filter((seatLabel) => !assignedSeats.has(seatLabel));
	for (const item of parsed) {
		if (item.seatLabel) continue;
		const nextSeat = unassignedSeatQueue.shift();
		if (nextSeat) item.seatLabel = nextSeat;
	}

	return { ok: true, value: parsed };
};

const stopKey = (s) => String(s || "").trim().toLowerCase();

const pickSchedulePoint = (points, selectedName) => {
	const selectedKey = stopKey(selectedName);
	if (!selectedKey) return null;
	const arr = Array.isArray(points) ? points : [];
	const found = arr.find((p) => stopKey(p?.name) === selectedKey);
	if (!found) return null;
	const name = String(found?.name || "").trim();
	const date = String(found?.date || "").trim();
	const time = String(found?.time || "").trim();
	const orderRaw = Number(found?.order);
	const order = Number.isFinite(orderRaw) && orderRaw > 0 ? Math.trunc(orderRaw) : undefined;
	return {
		name,
		date,
		time,
		...(Number.isFinite(order) ? { order } : {}),
	};
};

const parseIsoDateTimeMs = (date, time) => {
	const d = String(date || "").trim();
	const t = String(time || "").trim();
	if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(t)) return NaN;
	return new Date(`${d}T${t}:00`).getTime();
};

const getEsewaConfig = () => {
	const productCode = process.env.ESEWA_PRODUCT_CODE || "EPAYTEST";
	const secretKey = process.env.ESEWA_SECRET_KEY || "8gBm/:&EnhH.1/q";
	const formUrl = process.env.ESEWA_FORM_URL || "https://rc-epay.esewa.com.np/api/epay/main/v2/form";
	const statusUrlBase = process.env.ESEWA_STATUS_URL || "https://rc.esewa.com.np/api/epay/transaction/status/";
	return { productCode, secretKey, formUrl, statusUrlBase };
};

const getPublicBaseUrl = () => {
	const env = String(process.env.PUBLIC_BASE_URL || "").trim();
	if (env) return env.replace(/\/$/, "");
	const port = Number(process.env.PORT) || 5000;
	return `http://localhost:${port}`;
};

const getFrontendBaseUrl = () => {
	const env = String(process.env.FRONTEND_URL || "").trim();
	return (env || "http://localhost:5173").replace(/\/$/, "");
};

const makeSignature = ({ totalAmount, transactionUuid, productCode, secretKey }) => {
	const msg = `total_amount=${totalAmount},transaction_uuid=${transactionUuid},product_code=${productCode}`;
	return crypto.createHmac("sha256", secretKey).update(msg).digest("base64");
};

const decodeEsewaData = (data) => {
	if (!data) return null;
	let b64 = String(data).trim();
	b64 = b64.replace(/ /g, "+");
	// base64url -> base64
	b64 = b64.replace(/-/g, "+").replace(/_/g, "/");
	const pad = b64.length % 4;
	if (pad) b64 += "=".repeat(4 - pad);
	const text = Buffer.from(b64, "base64").toString("utf8");
	return JSON.parse(text);
};

const checkEsewaStatus = async ({ statusUrlBase, productCode, totalAmount, transactionUuid }) => {
	const u = new URL(statusUrlBase);
	u.searchParams.set("product_code", String(productCode));
	u.searchParams.set("total_amount", String(totalAmount));
	u.searchParams.set("transaction_uuid", String(transactionUuid));

	const resp = await fetch(u.toString(), {
		method: "GET",
		headers: { Accept: "application/json" },
	});
	if (!resp.ok) {
		const body = await resp.text().catch(() => "");
		throw new Error(`eSewa status check failed (${resp.status}): ${body || resp.statusText}`);
	}
	return resp.json();
};

exports.initiateEsewaPayment = async (req, res) => {
	try {
		const { scheduleId, seats } = req.body;
		const normalizedSeats = parseSeats(seats);
		if (!scheduleId || !normalizedSeats) {
			return res.status(400).json({ message: "scheduleId and seats[] are required" });
		}

		const boardingPointName = String(req.body?.boardingPoint || "").trim();
		const droppingPointName = String(req.body?.droppingPoint || "").trim();
		if (!boardingPointName || !droppingPointName) {
			return res.status(400).json({ message: "boardingPoint and droppingPoint are required" });
		}
		if (stopKey(boardingPointName) === stopKey(droppingPointName)) {
			return res.status(400).json({ message: "Dropping point must be different from boarding point" });
		}

		const passenger = parsePassenger(req.body?.passenger);
		if (!passenger) {
			return res.status(400).json({ message: "passenger{name,age,gender,phone} is required" });
		}

		const passengersResult = parsePassengers({
			passengers: req.body?.passengers,
			seatLabels: normalizedSeats,
			fallbackPassenger: passenger,
		});
		if (!passengersResult.ok) {
			return res.status(400).json({ message: passengersResult.message });
		}
		const passengers = passengersResult.value;

		const { productCode, secretKey, formUrl } = getEsewaConfig();

		const schedule = await Schedule.findById(scheduleId).populate("bus").populate("route");
		if (!schedule) return res.status(404).json({ message: "Schedule not found" });
		if (!schedule.route) return res.status(400).json({ message: "Schedule route missing" });
		if (!schedule.bus) return res.status(400).json({ message: "Schedule bus not configured" });

		const selectedBoardingPoint = pickSchedulePoint(schedule.boardingPoints, boardingPointName);
		if (!selectedBoardingPoint) {
			return res.status(400).json({ message: "Invalid boarding point" });
		}
		const selectedDroppingPoint = pickSchedulePoint(schedule.droppingPoints, droppingPointName);
		if (!selectedDroppingPoint) {
			return res.status(400).json({ message: "Invalid dropping point" });
		}

		const boardingOrder = Number(selectedBoardingPoint?.order);
		const droppingOrder = Number(selectedDroppingPoint?.order);

		if (Number.isFinite(boardingOrder) && Number.isFinite(droppingOrder)) {
			if (droppingOrder <= boardingOrder) {
				return res.status(400).json({ message: "Dropping point must be after boarding point" });
			}
		} else {
			const routeOrderIndex = buildRouteOrderIndex(schedule.route || {});
			const bIdx = routeOrderIndex.get(stopKey(selectedBoardingPoint.name));
			const dIdx = routeOrderIndex.get(stopKey(selectedDroppingPoint.name));
			if (bIdx === undefined || dIdx === undefined) {
				return res.status(400).json({ message: "Selected points must exist in the route stop list" });
			}
			if (dIdx <= bIdx) {
				return res.status(400).json({ message: "Dropping point must be after boarding point" });
			}
		}

		const boardingMs = parseIsoDateTimeMs(selectedBoardingPoint.date, selectedBoardingPoint.time);
		const droppingMs = parseIsoDateTimeMs(selectedDroppingPoint.date, selectedDroppingPoint.time);
		if (!Number.isFinite(boardingMs) || !Number.isFinite(droppingMs)) {
			return res.status(400).json({ message: "Selected points must have valid date and time" });
		}
		if (droppingMs <= boardingMs) {
			return res.status(400).json({ message: "Dropping time must be after boarding time" });
		}

		const seatCatalog = buildSeatCatalog(schedule.bus, DEFAULT_SEAT_PRICE);
		if (seatCatalog.size <= 0) {
			return res.status(400).json({ message: "No seat layout configured for this bus" });
		}

		const { invalidSeats, unavailableSeats } = validateSeatSelection(seatCatalog, normalizedSeats);
		if (invalidSeats.length > 0) {
			return res.status(400).json({ message: "One or more seats are invalid", invalidSeats });
		}
		if (unavailableSeats.length > 0) {
			return res.status(400).json({ message: "One or more seats are currently unavailable", unavailableSeats });
		}

		const seatQueryValues = buildSeatQueryValues(normalizedSeats);

		// Ensure seats are not already booked
		const alreadyBooked = await Booking.find({
			schedule: scheduleId,
			status: "confirmed",
			seats: { $in: seatQueryValues },
		}).select("_id seats");

		if (alreadyBooked.length > 0) {
			const bookedSeats = [...new Set(
				alreadyBooked
					.flatMap((b) => (Array.isArray(b?.seats) ? b.seats : []))
					.map((seat) => normalizeSeatLabel(seat))
					.filter((seat) => normalizedSeats.includes(seat))
			)].sort(sortSeatLabels);
			return res.status(409).json({ message: "Some seats already booked", bookedSeats });
		}

		const lockValidation = await seatLockService.validateLocks({
			scheduleId,
			seats: normalizedSeats,
			userId: req.user.id,
		});
		if (!lockValidation.valid) {
			const missingLocks = [...lockValidation.missingLocks, ...lockValidation.conflictSeats].sort(sortSeatLabels);
			return res.status(409).json({
				message: "Seat lock required before payment. Missing locks",
				missingLocks,
				conflictSeats: lockValidation.conflictSeats,
				failedSeats: missingLocks,
			});
		}

		// Extend lock TTL from payment initiation to reduce gateway timeout risk.
		await seatLockService.lockSeats({
			scheduleId,
			seats: normalizedSeats,
			userId: req.user.id,
			sessionId: req.body?.sessionId,
		});

		const seatPriceBreakdown = buildSeatPriceBreakdown(normalizedSeats, seatCatalog);
		const totalPrice = seatPriceBreakdown.reduce((sum, seat) => sum + toFinitePrice(seat.price), 0);
		const pricePerSeat = normalizedSeats.length > 0 ? Number((totalPrice / normalizedSeats.length).toFixed(2)) : 0;
		if (!Number.isFinite(totalPrice) || totalPrice <= 0) {
			return res.status(400).json({ message: "Invalid schedule price" });
		}

		// Reuse existing pending booking if present (idempotency)
		let booking = await Booking.findOne({
			user: req.user.id,
			schedule: scheduleId,
			seats: normalizedSeats,
			status: "payment_pending",
			"payment.provider": "esewa",
			"payment.status": "initiated",
		});

		if (!booking) {
			booking = await Booking.create({
				user: req.user.id,
				schedule: scheduleId,
				passenger,
				passengers,
				boardingPoint: selectedBoardingPoint,
				droppingPoint: selectedDroppingPoint,
				seats: normalizedSeats,
				seatPriceBreakdown,
				pricePerSeat,
				totalPrice,
				status: "payment_pending",
				payment: {
					provider: "esewa",
					status: "initiated",
					productCode: productCode,
					totalAmount: totalPrice,
					transactionUuid: crypto.randomUUID(),
				},
			});
		} else {
			booking.passenger = passenger;
			booking.passengers = passengers;
			booking.boardingPoint = selectedBoardingPoint;
			booking.droppingPoint = selectedDroppingPoint;
			await booking.save();
		}

		const publicBaseUrl = getPublicBaseUrl();
		const totalAmount = booking.payment?.totalAmount ?? booking.totalPrice;
		const transactionUuid = booking.payment?.transactionUuid;
		if (!transactionUuid) {
			return res.status(500).json({ message: "Payment transaction UUID missing" });
		}

		const signedFieldNames = "total_amount,transaction_uuid,product_code";
		const signature = makeSignature({
			totalAmount,
			transactionUuid,
			productCode,
			secretKey,
		});

		const fields = {
			amount: String(totalAmount),
			tax_amount: "0",
			product_service_charge: "0",
			product_delivery_charge: "0",
			total_amount: String(totalAmount),
			transaction_uuid: String(transactionUuid),
			product_code: String(productCode),
			success_url: `${publicBaseUrl}/api/payments/esewa/success`,
			failure_url: `${publicBaseUrl}/api/payments/esewa/failure`,
			signed_field_names: signedFieldNames,
			signature,
		};

		return res.json({ bookingId: booking._id, formUrl, fields });
	} catch (e) {
		const formatted = seatLockService.formatError(e);
		return res.status(formatted.statusCode).json(formatted.payload);
	}
};

exports.handleEsewaSuccess = async (req, res) => {
	const frontendBaseUrl = getFrontendBaseUrl();
	try {
		const decoded = decodeEsewaData(req.query?.data);
		const transactionUuid = decoded?.transaction_uuid;
		if (!transactionUuid) {
			return res.redirect(`${frontendBaseUrl}/dashboard?payment=error`);
		}

		const booking = await Booking.findOne({ "payment.transactionUuid": String(transactionUuid) })
			.populate("user")
			.populate({ path: "schedule", populate: [{ path: "bus" }, { path: "route" }] });

		if (!booking) {
			return res.redirect(`${frontendBaseUrl}/dashboard?payment=error`);
		}

		if (booking.status === "confirmed" && booking.payment?.status === "paid") {
			if (!booking.payment?.emailSentAt) {
				const ok = await sendTicketEmailSafely(booking);
				if (!ok) {
					// eslint-disable-next-line no-console
					console.warn("Ticket email not sent for booking", String(booking._id));
				}
			}
			return res.redirect(`${frontendBaseUrl}/dashboard?payment=success&bookingId=${booking._id}`);
		}

		const { statusUrlBase, productCode } = getEsewaConfig();
		const totalAmount = booking.payment?.totalAmount ?? booking.totalPrice;
		const status = await checkEsewaStatus({
			statusUrlBase,
			productCode: booking.payment?.productCode || productCode,
			totalAmount,
			transactionUuid,
		});

		const gatewayStatus = String(status?.status || "").toUpperCase();
		booking.payment = booking.payment || { provider: "esewa" };
		booking.payment.gatewayStatus = gatewayStatus;
		booking.payment.refId = status?.ref_id || booking.payment.refId;
		booking.payment.raw = { success: decoded, status };

		if (gatewayStatus === "COMPLETE") {
			try {
				await seatLockService.confirmBooking({
					scheduleId: booking.schedule?._id || booking.schedule,
					seats: booking.seats,
					userId: booking.user?._id || booking.user,
					confirmFn: async () => {
						booking.status = "confirmed";
						booking.payment.status = "paid";
						booking.payment.paidAt = booking.payment.paidAt || new Date();
						await booking.save();
						return booking;
					},
				});
			} catch (error) {
				if (seatLockService.isSeatLockError(error)) {
					booking.status = "payment_failed";
					booking.payment.status = "failed";
					await booking.save();

					await seatLockService.releaseLocks({
						scheduleId: booking.schedule?._id || booking.schedule,
						seats: booking.seats,
						allowEmptySeats: true,
					}).catch(() => {});
					return res.redirect(`${frontendBaseUrl}/dashboard?payment=failure&bookingId=${booking._id}`);
				}
				throw error;
			}

			const ok = await sendTicketEmailSafely(booking);
			if (!ok) {
				// eslint-disable-next-line no-console
				console.warn("Ticket email not sent for booking", String(booking._id));
			}

			await createAdminNotification({
				type: "booking",
				title: "New booking received",
				message: `${booking?.passenger?.name || "A passenger"} completed booking on ${booking?.schedule?.route?.source || "Unknown"} -> ${booking?.schedule?.route?.destination || "Unknown"}.`,
				entityType: "booking",
				entityId: booking._id,
				data: {
					bookingId: String(booking._id),
					status: "confirmed",
				},
			});

			return res.redirect(`${frontendBaseUrl}/dashboard?payment=success&bookingId=${booking._id}`);
		}

		booking.status = "payment_failed";
		booking.payment.status = "failed";
		await booking.save();

		await seatLockService.releaseLocks({
			scheduleId: booking.schedule?._id || booking.schedule,
			seats: booking.seats,
			allowEmptySeats: true,
		}).catch(() => {});

		return res.redirect(`${frontendBaseUrl}/dashboard?payment=failure&bookingId=${booking._id}`);
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error(e);
		return res.redirect(`${frontendBaseUrl}/dashboard?payment=error`);
	}
};

exports.handleEsewaFailure = async (req, res) => {
	const frontendBaseUrl = getFrontendBaseUrl();
	try {
		const decoded = decodeEsewaData(req.query?.data);
		const transactionUuid = decoded?.transaction_uuid;
		if (!transactionUuid) {
			return res.redirect(`${frontendBaseUrl}/dashboard?payment=failure`);
		}

		const booking = await Booking.findOne({ "payment.transactionUuid": String(transactionUuid) });
		if (booking) {
			booking.status = "payment_failed";
			booking.payment = booking.payment || { provider: "esewa" };
			booking.payment.status = "failed";
			booking.payment.raw = { failure: decoded };
			await booking.save();

			await seatLockService.releaseLocks({
				scheduleId: booking.schedule,
				seats: booking.seats,
				allowEmptySeats: true,
			}).catch(() => {});

			return res.redirect(`${frontendBaseUrl}/dashboard?payment=failure&bookingId=${booking._id}`);
		}

		return res.redirect(`${frontendBaseUrl}/dashboard?payment=failure`);
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error(e);
		return res.redirect(`${frontendBaseUrl}/dashboard?payment=error`);
	}
};
