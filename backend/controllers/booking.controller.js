// Handles booking creation, retrieval, cancellation, and status updates
const Booking = require("../models/Booking");
const SeatLock = require("../models/SeatLock");
const Schedule = require("../models/Schedule");
const { generateTicketPdfBuffer } = require("../utils/ticketPdf");

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

exports.lockSeats = async (req, res) => {
	try {
		const { scheduleId, seats } = req.body;
		const normalizedSeats = parseSeats(seats);
		if (!scheduleId || !normalizedSeats) {
			return res.status(400).json({ message: "scheduleId and seats[] are required" });
		}

		// Ensure stale locks don't block new locks even if TTL index isn't active.
		await cleanupExpiredLocks(scheduleId);

		const schedule = await Schedule.findById(scheduleId).populate("bus");
		if (!schedule) return res.status(404).json({ message: "Schedule not found" });

		const totalSeats = schedule.bus?.totalSeats || 0;
		if (totalSeats <= 0) return res.status(400).json({ message: "Schedule bus missing totalSeats" });
		if (normalizedSeats.some((n) => n > totalSeats)) {
			return res.status(400).json({ message: "One or more seats are out of range" });
		}

		const alreadyBooked = await Booking.find({
			schedule: scheduleId,
			status: "confirmed",
			seats: { $in: normalizedSeats },
		}).select("_id seats");

		if (alreadyBooked.length > 0) {
			const bookedSeats = [...new Set(alreadyBooked.flatMap((b) => b.seats))].filter((s) => normalizedSeats.includes(s));
			return res.status(409).json({ message: "Some seats already booked", bookedSeats });
		}

		const docs = normalizedSeats.map((seatNumber) => ({
			schedule: scheduleId,
			seatNumber,
			lockedBy: req.user.id,
			lockedAt: new Date(),
		}));

		try {
			await SeatLock.insertMany(docs, { ordered: false });
		} catch (e) {
			// Duplicate key error means lock conflict
			if (!(e && (e.code === 11000 || e.writeErrors?.some((we) => we.code === 11000)))) {
				throw e;
			}

			const existingLocks = await SeatLock.find({
				schedule: scheduleId,
				seatNumber: { $in: normalizedSeats },
			}).select("seatNumber lockedBy");

			const conflicts = existingLocks
				.filter((l) => String(l.lockedBy) !== String(req.user.id))
				.map((l) => l.seatNumber)
				.sort((a, b) => a - b);

			if (conflicts.length > 0) {
				return res.status(409).json({ message: "Some seats are currently locked", lockedSeats: conflicts });
			}

			// Idempotent: if seats are already locked by the same user, treat as success and refresh TTL.
			await SeatLock.updateMany(
				{ schedule: scheduleId, seatNumber: { $in: normalizedSeats }, lockedBy: req.user.id },
				{ $set: { lockedAt: new Date() } }
			);
		}

		return res.json({ message: "Seats locked", seats: normalizedSeats });
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};

exports.unlockSeats = async (req, res) => {
	try {
		const { scheduleId, seats } = req.body;
		const normalizedSeats = parseSeats(seats);
		if (!scheduleId || !normalizedSeats) {
			return res.status(400).json({ message: "scheduleId and seats[] are required" });
		}

		await SeatLock.deleteMany({
			schedule: scheduleId,
			seatNumber: { $in: normalizedSeats },
			lockedBy: req.user.id,
		});

		return res.json({ message: "Seats unlocked", seats: normalizedSeats });
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};

exports.createBooking = async (req, res) => {
	try {
		if (String(process.env.REQUIRE_ONLINE_PAYMENT || "true").toLowerCase() !== "false") {
			return res.status(400).json({ message: "Online payment required. Use eSewa payment from the booking page." });
		}

		const { scheduleId, seats } = req.body;
		const normalizedSeats = parseSeats(seats);
		if (!scheduleId || !normalizedSeats) {
			return res.status(400).json({ message: "scheduleId and seats[] are required" });
		}

		const passenger = parsePassenger(req.body?.passenger);
		if (!passenger) {
			return res.status(400).json({ message: "passenger{name,age,gender,phone} is required" });
		}

		const boardingPointName = String(req.body?.boardingPoint || "").trim();
		const droppingPointName = String(req.body?.droppingPoint || "").trim();
		if (!boardingPointName || !droppingPointName) {
			return res.status(400).json({ message: "boardingPoint and droppingPoint are required" });
		}
		if (stopKey(boardingPointName) === stopKey(droppingPointName)) {
			return res.status(400).json({ message: "Dropping point must be different from boarding point" });
		}

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

		const totalSeats = schedule.bus?.totalSeats || 0;
		if (totalSeats <= 0) return res.status(400).json({ message: "Schedule bus missing totalSeats" });
		if (normalizedSeats.some((n) => n > totalSeats)) {
			return res.status(400).json({ message: "One or more seats are out of range" });
		}

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
			return res.status(409).json({ message: "Seat lock required before booking", missingLocks });
		}

		const booking = await Booking.create({
			user: req.user.id,
			schedule: scheduleId,
			passenger,
			boardingPoint: selectedBoardingPoint,
			droppingPoint: selectedDroppingPoint,
			seats: normalizedSeats,
			pricePerSeat: Number.isFinite(Number(schedule.price)) ? Number(schedule.price) : undefined,
			totalPrice: Number.isFinite(Number(schedule.price)) ? Number(schedule.price) * normalizedSeats.length : undefined,
			status: "confirmed",
		});

		await SeatLock.deleteMany({
			schedule: scheduleId,
			seatNumber: { $in: normalizedSeats },
			lockedBy: req.user.id,
		});

		return res.status(201).json(booking);
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};

exports.getMyBookings = async (req, res) => {
	try {
		const bookings = await Booking.find({ user: req.user.id })
			.sort({ createdAt: -1 })
			.populate({ path: "schedule", populate: [{ path: "bus" }, { path: "route" }] });
		return res.json(bookings);
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};

exports.getBookingById = async (req, res) => {
	try {
		const booking = await Booking.findById(req.params.id).populate({
			path: "schedule",
			populate: [{ path: "bus" }, { path: "route" }],
		});
		if (!booking) return res.status(404).json({ message: "Not found" });
		if (booking.user.toString() !== req.user.id && req.user.role !== "admin") {
			return res.status(403).json({ message: "Forbidden" });
		}
		return res.json(booking);
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};

exports.getTicketPdf = async (req, res) => {
	try {
		const booking = await Booking.findById(req.params.id).populate({
			path: "schedule",
			populate: [{ path: "bus" }, { path: "route" }],
		});
		if (!booking) return res.status(404).json({ message: "Not found" });
		if (booking.user.toString() !== req.user.id && req.user.role !== "admin") {
			return res.status(403).json({ message: "Forbidden" });
		}
		if (booking.status !== "confirmed") {
			return res.status(400).json({ message: "Ticket is available after confirmation" });
		}

		const pdf = await generateTicketPdfBuffer(booking);
		const filename = `ticket-${booking._id}.pdf`;

		res.setHeader("Content-Type", "application/pdf");
		res.setHeader("Content-Disposition", `inline; filename=\"${filename}\"`);
		res.setHeader("Cache-Control", "no-store");
		return res.status(200).send(pdf);
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};

exports.cancelBooking = async (req, res) => {
	try {
		const booking = await Booking.findById(req.params.id);
		if (!booking) return res.status(404).json({ message: "Not found" });
		if (booking.user.toString() !== req.user.id && req.user.role !== "admin") {
			return res.status(403).json({ message: "Forbidden" });
		}
		booking.status = "cancelled";
		await booking.save();
		return res.json({ message: "Cancelled" });
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};
