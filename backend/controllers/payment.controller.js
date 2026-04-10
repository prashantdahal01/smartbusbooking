// Handles eSewa (ePay v2) payment initiation and callback verification
const crypto = require("crypto");

const Booking = require("../models/Booking");
const SeatLock = require("../models/SeatLock");
const Schedule = require("../models/Schedule");
const { sendTicketEmailSafely } = require("../utils/mailer");

const LOCK_TTL_MS = 10 * 60 * 1000;

const cleanupExpiredLocks = async (scheduleId) => {
	const cutoff = new Date(Date.now() - LOCK_TTL_MS);
	await SeatLock.deleteMany({ schedule: scheduleId, lockedAt: { $lt: cutoff } });
};

const parseSeats = (seats) => {
	if (!Array.isArray(seats) || seats.length === 0) return null;
	const parsed = seats.map((s) => Number(s)).filter((n) => Number.isInteger(n) && n > 0);
	if (parsed.length !== seats.length) return null;
	return [...new Set(parsed)].sort((a, b) => a - b);
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

const stopKey = (s) => String(s || "").trim().toLowerCase();

const toStopName = (raw) => {
	if (raw === null || raw === undefined) return "";
	if (typeof raw === "string") return raw;
	if (typeof raw === "object") return raw.name;
	return "";
};

const buildRouteStops = (route) => {
	const src = String(route?.source || "").trim();
	const dst = String(route?.destination || "").trim();
	const midsRaw = Array.isArray(route?.stops) ? route.stops : [];
	const mids = midsRaw.map((s) => String(toStopName(s) || "").trim()).filter(Boolean);
	const list = [src, ...mids, dst].map((s) => String(s || "").trim()).filter(Boolean);
	const seen = new Set();
	const out = [];
	list.forEach((s) => {
		const k = stopKey(s);
		if (!k) return;
		if (seen.has(k)) return;
		seen.add(k);
		out.push(s);
	});
	return out;
};

const buildStopIndexByKey = (stops) => {
	const map = new Map();
	(Array.isArray(stops) ? stops : []).forEach((s, idx) => {
		const k = stopKey(s);
		if (!k) return;
		if (!map.has(k)) map.set(k, idx);
	});
	return map;
};

const pickSchedulePoint = (points, selectedName) => {
	const selectedKey = stopKey(selectedName);
	if (!selectedKey) return null;
	const arr = Array.isArray(points) ? points : [];
	const found = arr.find((p) => stopKey(p?.name) === selectedKey);
	if (!found) return null;
	const name = String(found?.name || "").trim();
	const date = String(found?.date || "").trim();
	const time = String(found?.time || "").trim();
	return { name, date, time };
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

		const { productCode, secretKey, formUrl } = getEsewaConfig();

		const schedule = await Schedule.findById(scheduleId).populate("bus").populate("route");
		if (!schedule) return res.status(404).json({ message: "Schedule not found" });
		if (!schedule.route) return res.status(400).json({ message: "Schedule route missing" });

		const selectedBoardingPoint = pickSchedulePoint(schedule.boardingPoints, boardingPointName);
		if (!selectedBoardingPoint) {
			return res.status(400).json({ message: "Invalid boarding point" });
		}
		const selectedDroppingPoint = pickSchedulePoint(schedule.droppingPoints, droppingPointName);
		if (!selectedDroppingPoint) {
			return res.status(400).json({ message: "Invalid dropping point" });
		}

		const routeStops = buildRouteStops(schedule.route);
		const indexByKey = buildStopIndexByKey(routeStops);
		const bIdx = indexByKey.get(stopKey(selectedBoardingPoint.name));
		const dIdx = indexByKey.get(stopKey(selectedDroppingPoint.name));
		if (bIdx === undefined || dIdx === undefined) {
			return res.status(400).json({ message: "Selected points must exist in the route stop list" });
		}
		if (dIdx <= bIdx) {
			return res.status(400).json({ message: "Dropping point must be after boarding point" });
		}

		const boardingMs = parseIsoDateTimeMs(selectedBoardingPoint.date, selectedBoardingPoint.time);
		const droppingMs = parseIsoDateTimeMs(selectedDroppingPoint.date, selectedDroppingPoint.time);
		if (!Number.isFinite(boardingMs) || !Number.isFinite(droppingMs)) {
			return res.status(400).json({ message: "Selected points must have valid date and time" });
		}
		if (droppingMs <= boardingMs) {
			return res.status(400).json({ message: "Dropping time must be after boarding time" });
		}

		// Remove stale locks so they don't block unique index or payment flow.
		await cleanupExpiredLocks(scheduleId);

		const totalSeats = schedule.bus?.totalSeats || 0;
		if (totalSeats <= 0) return res.status(400).json({ message: "Schedule bus missing totalSeats" });
		if (normalizedSeats.some((n) => n > totalSeats)) {
			return res.status(400).json({ message: "One or more seats are out of range" });
		}

		// Ensure seats are not already booked
		const alreadyBooked = await Booking.find({
			schedule: scheduleId,
			status: "confirmed",
			seats: { $in: normalizedSeats },
		}).select("_id seats");

		if (alreadyBooked.length > 0) {
			const bookedSeats = [...new Set(alreadyBooked.flatMap((b) => b.seats))].filter((s) => normalizedSeats.includes(s));
			return res.status(409).json({ message: "Some seats already booked", bookedSeats });
		}

		// Require locks held by current user for all seats
		const locks = await SeatLock.find({
			schedule: scheduleId,
			seatNumber: { $in: normalizedSeats },
			lockedBy: req.user.id,
		}).select("seatNumber");

		const lockedSeatNumbers = new Set(locks.map((l) => l.seatNumber));
		const missingLocks = normalizedSeats.filter((s) => !lockedSeatNumbers.has(s));
		if (missingLocks.length > 0) {
			return res.status(409).json({ message: "Seat lock required before payment", missingLocks });
		}

		// Refresh lock TTL starting from payment initiation time
		await SeatLock.updateMany(
			{
				schedule: scheduleId,
				seatNumber: { $in: normalizedSeats },
				lockedBy: req.user.id,
			},
			{ $set: { lockedAt: new Date() } }
		);

		const pricePerSeat = Number.isFinite(Number(schedule.price)) ? Number(schedule.price) : 0;
		const totalPrice = pricePerSeat * normalizedSeats.length;
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
				boardingPoint: selectedBoardingPoint,
				droppingPoint: selectedDroppingPoint,
				seats: normalizedSeats,
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
		return res.status(500).json({ message: e.message });
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
			booking.status = "confirmed";
			booking.payment.status = "paid";
			booking.payment.paidAt = booking.payment.paidAt || new Date();
			await booking.save();

			await SeatLock.deleteMany({
				schedule: booking.schedule?._id || booking.schedule,
				seatNumber: { $in: booking.seats },
			});

			const ok = await sendTicketEmailSafely(booking);
			if (!ok) {
				// eslint-disable-next-line no-console
				console.warn("Ticket email not sent for booking", String(booking._id));
			}

			return res.redirect(`${frontendBaseUrl}/dashboard?payment=success&bookingId=${booking._id}`);
		}

		booking.status = "payment_failed";
		booking.payment.status = "failed";
		await booking.save();

		await SeatLock.deleteMany({
			schedule: booking.schedule?._id || booking.schedule,
			seatNumber: { $in: booking.seats },
		});

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

			await SeatLock.deleteMany({
				schedule: booking.schedule,
				seatNumber: { $in: booking.seats },
			});

			return res.redirect(`${frontendBaseUrl}/dashboard?payment=failure&bookingId=${booking._id}`);
		}

		return res.redirect(`${frontendBaseUrl}/dashboard?payment=failure`);
	} catch (e) {
		// eslint-disable-next-line no-console
		console.error(e);
		return res.redirect(`${frontendBaseUrl}/dashboard?payment=error`);
	}
};
