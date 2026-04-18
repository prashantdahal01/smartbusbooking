// Handles booking creation, retrieval, cancellation, and status updates
const Booking = require("../models/Booking");
const Bus = require("../models/Bus");
const Schedule = require("../models/Schedule");
const { seatLockService } = require("../algorithms/seatLock");
const { generateTicketPdfBuffer } = require("../utils/ticketPdf");
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

exports.lockSeats = async (req, res) => {
	try {
		const { scheduleId, seats, sessionId } = req.body;
		const lockResult = await seatLockService.lockSeats({
			scheduleId,
			seats,
			userId: req.user.id,
			sessionId,
		});

		return res.json({
			message: "Seats locked",
			success: true,
			seats: lockResult.seats,
			lockedSeats: lockResult.seats,
			failedSeats: [],
			expiresAt: lockResult.expiresAt,
		});
	} catch (e) {
		const formatted = seatLockService.formatError(e);
		return res.status(formatted.statusCode).json(formatted.payload);
	}
};

exports.unlockSeats = async (req, res) => {
	try {
		const { scheduleId, seats } = req.body;
		const normalizedSeats = parseSeats(seats);
		if (!scheduleId || !normalizedSeats) {
			return res.status(400).json({ message: "scheduleId and seats[] are required" });
		}

		await seatLockService.releaseLocks({
			scheduleId,
			seats: normalizedSeats,
			userId: req.user.id,
		});

		return res.json({ message: "Seats unlocked", seats: normalizedSeats, success: true });
	} catch (e) {
		const formatted = seatLockService.formatError(e);
		return res.status(formatted.statusCode).json(formatted.payload);
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

		const passengersResult = parsePassengers({
			passengers: req.body?.passengers,
			seatLabels: normalizedSeats,
			fallbackPassenger: passenger,
		});
		if (!passengersResult.ok) {
			return res.status(400).json({ message: passengersResult.message });
		}
		const passengers = passengersResult.value;

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

		const scheduleFallbackPrice = toFinitePrice(schedule?.price, DEFAULT_SEAT_PRICE);
		const seatCatalog = buildSeatCatalog(schedule.bus, scheduleFallbackPrice);
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
				message: "Seat lock required before booking",
				missingLocks,
				failedSeats: missingLocks,
			});
		}

		const seatPriceBreakdown = buildSeatPriceBreakdown(normalizedSeats, seatCatalog);
		const totalPrice = seatPriceBreakdown.reduce((sum, seat) => sum + toFinitePrice(seat.price), 0);
		const pricePerSeat = normalizedSeats.length > 0 ? Number((totalPrice / normalizedSeats.length).toFixed(2)) : 0;

		const bookingResult = await seatLockService.confirmBooking({
			scheduleId,
			seats: normalizedSeats,
			userId: req.user.id,
			confirmFn: () => Booking.create({
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
				status: "confirmed",
			}),
		});

		const booking = bookingResult.result;

		await createAdminNotification({
			type: "booking",
			title: "New booking received",
			message: `${passenger.name} booked ${normalizedSeats.length} seat(s) on ${schedule.route?.source || "Unknown"} -> ${schedule.route?.destination || "Unknown"}.`,
			entityType: "booking",
			entityId: booking._id,
			data: {
				bookingId: String(booking._id),
				route: `${schedule.route?.source || "Unknown"} -> ${schedule.route?.destination || "Unknown"}`,
				seats: normalizedSeats,
			},
		});

		return res.status(201).json(booking);
	} catch (e) {
		const formatted = seatLockService.formatError(e);
		return res.status(formatted.statusCode).json(formatted.payload);
	}
};

exports.getOperatorBookings = async (req, res) => {
	try {
		const operatorId = String(req.user?.id || "").trim();
		if (!operatorId) {
			return res.status(401).json({ message: "Unauthorized" });
		}

		const dateFilter = String(req.query?.date || "").trim();
		const scheduleFilter = String(req.query?.schedule || req.query?.scheduleId || "").trim();

		if (scheduleFilter && !/^[a-f\d]{24}$/i.test(scheduleFilter)) {
			return res.status(400).json({ message: "Invalid schedule id" });
		}

		const buses = await Bus.find({ operator: operatorId })
			.select("_id name vehicleNumber")
			.lean();

		if (buses.length === 0) {
			return res.json({
				items: [],
				summary: {
					totalBookings: 0,
					totalRevenue: 0,
					paidCount: 0,
					cancelledCount: 0,
					byBus: [],
					byDay: [],
				},
				availableSchedules: [],
			});
		}

		const busIds = buses.map((bus) => bus._id);
		const scheduleMatch = { bus: { $in: busIds } };

		if (dateFilter) {
			scheduleMatch.date = dateFilter;
		}
		if (scheduleFilter) {
			scheduleMatch._id = scheduleFilter;
		}

		const schedules = await Schedule.find(scheduleMatch)
			.select("_id bus route date time arrivalDate arrivalTime isActive")
			.populate("route", "source destination")
			.populate("bus", "name vehicleNumber")
			.sort({ date: -1, time: -1 })
			.lean();

		const scheduleIds = schedules.map((schedule) => schedule._id);
		if (scheduleIds.length === 0) {
			return res.json({
				items: [],
				summary: {
					totalBookings: 0,
					totalRevenue: 0,
					paidCount: 0,
					cancelledCount: 0,
					byBus: [],
					byDay: [],
				},
				availableSchedules: schedules.map((schedule) => ({
					id: String(schedule._id),
					date: schedule.date,
					time: schedule.time,
					route: `${String(schedule?.route?.source || "Unknown").trim()} -> ${String(schedule?.route?.destination || "Unknown").trim()}`,
					busName: String(schedule?.bus?.name || "").trim(),
					isActive: schedule?.isActive !== false,
				})),
			});
		}

		const bookings = await Booking.find({ schedule: { $in: scheduleIds } })
			.sort({ createdAt: -1 })
			.populate("user", "name email phone")
			.populate({
				path: "schedule",
				select: "date time arrivalDate arrivalTime route bus",
				populate: [
					{ path: "route", select: "source destination" },
					{ path: "bus", select: "name vehicleNumber" },
				],
			})
			.lean();

		const revenueByBus = new Map();
		const revenueByDay = new Map();
		let totalRevenue = 0;
		let paidCount = 0;
		let cancelledCount = 0;

		const items = bookings.map((booking) => {
			const routeSource = String(booking?.schedule?.route?.source || "Unknown").trim();
			const routeDestination = String(booking?.schedule?.route?.destination || "Unknown").trim();
			const routeLabel = `${routeSource} -> ${routeDestination}`;

			const busName = String(booking?.schedule?.bus?.name || "-").trim() || "-";
			const bookingStatus = String(booking?.status || "confirmed").trim().toLowerCase();
			const paymentStatus = String(
				booking?.payment?.status
				|| (bookingStatus === "confirmed" ? "paid" : bookingStatus)
			).trim().toLowerCase();

			const seats = Array.isArray(booking?.seats) ? booking.seats : [];
			const totalPrice = Number(booking?.totalPrice);
			const perSeatPrice = Number(booking?.pricePerSeat);
			const amount = Number.isFinite(totalPrice)
				? totalPrice
				: (Number.isFinite(perSeatPrice) ? perSeatPrice * seats.length : 0);

			const passengerNames = [
				String(booking?.passenger?.name || "").trim(),
				...(Array.isArray(booking?.passengers) ? booking.passengers.map((p) => String(p?.name || "").trim()) : []),
			]
				.filter(Boolean)
				.filter((name, idx, arr) => arr.indexOf(name) === idx);

			const primaryPassenger = passengerNames[0]
				|| String(booking?.user?.name || "").trim()
				|| String(booking?.user?.email || "Guest").trim();

			const isRevenueBooking = bookingStatus !== "cancelled" && bookingStatus !== "payment_failed";
			if (isRevenueBooking) {
				totalRevenue += amount;
				paidCount += 1;

				const busRevenue = revenueByBus.get(busName) || { busName, bookings: 0, revenue: 0 };
				busRevenue.bookings += 1;
				busRevenue.revenue += amount;
				revenueByBus.set(busName, busRevenue);

				const dayKey = String(booking?.schedule?.date || "").trim()
					|| (booking?.createdAt ? new Date(booking.createdAt).toISOString().slice(0, 10) : "");
				if (dayKey) {
					const dayRevenue = revenueByDay.get(dayKey) || { date: dayKey, bookings: 0, revenue: 0 };
					dayRevenue.bookings += 1;
					dayRevenue.revenue += amount;
					revenueByDay.set(dayKey, dayRevenue);
				}
			} else {
				cancelledCount += 1;
			}

			return {
				id: String(booking?._id || ""),
				scheduleId: String(booking?.schedule?._id || ""),
				route: routeLabel,
				busName,
				scheduleDate: booking?.schedule?.date || null,
				scheduleTime: booking?.schedule?.time || null,
				passengerName: primaryPassenger,
				passengerNames,
				passengerCount: passengerNames.length > 0 ? passengerNames.length : Math.max(seats.length, 1),
				phone: String(booking?.passenger?.phone || booking?.user?.phone || "").trim() || "-",
				seats,
				boardingPoint: String(booking?.boardingPoint?.name || "").trim() || "-",
				droppingPoint: String(booking?.droppingPoint?.name || "").trim() || "-",
				status: bookingStatus,
				paymentStatus,
				amount,
				bookedAt: booking?.createdAt || null,
			};
		});

		const byBus = [...revenueByBus.values()]
			.map((row) => ({ ...row, revenue: Number(row.revenue.toFixed(2)) }))
			.sort((a, b) => b.revenue - a.revenue || a.busName.localeCompare(b.busName));

		const byDay = [...revenueByDay.values()]
			.map((row) => ({ ...row, revenue: Number(row.revenue.toFixed(2)) }))
			.sort((a, b) => a.date.localeCompare(b.date));

		const availableSchedules = schedules.map((schedule) => ({
			id: String(schedule._id),
			date: schedule.date,
			time: schedule.time,
			route: `${String(schedule?.route?.source || "Unknown").trim()} -> ${String(schedule?.route?.destination || "Unknown").trim()}`,
			busName: String(schedule?.bus?.name || "").trim(),
			isActive: schedule?.isActive !== false,
		}));

		return res.json({
			items,
			summary: {
				totalBookings: items.length,
				totalRevenue: Number(totalRevenue.toFixed(2)),
				paidCount,
				cancelledCount,
				byBus,
				byDay,
			},
			availableSchedules,
		});
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
		res.setHeader("Content-Disposition", `attachment; filename=\"${filename}\"`);
		res.setHeader("Cache-Control", "no-store");
		return res.status(200).send(pdf);
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};

exports.cancelBooking = async (req, res) => {
	try {
		const booking = await Booking.findById(req.params.id).populate({
			path: "schedule",
			populate: [{ path: "bus", select: "operator" }],
		});
		if (!booking) return res.status(404).json({ message: "Not found" });

		if (req.user.role !== "admin") {
			return res.status(403).json({ message: "Only admin can cancel bookings" });
		}

		if (booking.status === "cancelled") {
			return res.json({ message: "Already cancelled" });
		}

		booking.status = "cancelled";
		await booking.save();

		await createAdminNotification({
			type: "cancellation",
			title: "Booking cancelled",
			message: `Booking ${String(booking._id)} has been cancelled.`,
			entityType: "booking",
			entityId: booking._id,
			data: {
				bookingId: String(booking._id),
				status: "cancelled",
			},
		});

		return res.json({ message: "Cancelled" });
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};
