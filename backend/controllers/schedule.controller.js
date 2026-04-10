// Handles schedule search and seat status
const Schedule = require("../models/Schedule");
const Booking = require("../models/Booking");
const SeatLock = require("../models/SeatLock");

const LOCK_TTL_MS = 10 * 60 * 1000;

const cleanupExpiredLocks = async (scheduleId) => {
	const cutoff = new Date(Date.now() - LOCK_TTL_MS);
	await SeatLock.deleteMany({ schedule: scheduleId, lockedAt: { $lt: cutoff } });
};

exports.searchSchedules = async (req, res) => {
	try {
		const { source, destination, date } = req.query;
		const filter = {};
		if (date) filter.date = String(date);

		// We'll match source/destination on the populated route via aggregation-like approach
		// Simpler: populate and filter in memory for small datasets.
		const schedules = await Schedule.find(filter)
			.populate("bus")
			.populate("route");

		const norm = (s) => String(s || "").trim().toLowerCase();
		const src = norm(source);
		const dst = norm(destination);

		const filtered = schedules.filter((sch) => {
			if (!sch.route) return false;
			if (src && norm(sch.route.source) !== src) return false;
			if (dst && norm(sch.route.destination) !== dst) return false;
			return true;
		});

		return res.json(filtered);
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};

exports.getSearchOptions = async (req, res) => {
	try {
		const schedules = await Schedule.find({}).populate("route").select("route");

		const norm = (s) => String(s || "").trim();
		const key = (s) => norm(s).toLowerCase();

		const sourcesByKey = new Map();
		const destinationsByKey = new Map();
		const pairsByKey = new Map();

		schedules.forEach((sch) => {
			const src = norm(sch?.route?.source);
			const dst = norm(sch?.route?.destination);
			if (!src || !dst) return;

			const srcKey = key(src);
			const dstKey = key(dst);
			sourcesByKey.set(srcKey, src);
			destinationsByKey.set(dstKey, dst);

			const pairKey = `${srcKey}|||${dstKey}`;
			if (!pairsByKey.has(pairKey)) {
				pairsByKey.set(pairKey, { source: src, destination: dst });
			}
		});

		const sources = Array.from(sourcesByKey.values()).sort((a, b) => a.localeCompare(b));
		const destinations = Array.from(destinationsByKey.values()).sort((a, b) => a.localeCompare(b));
		const pairs = Array.from(pairsByKey.values()).sort((a, b) => {
			const c = a.source.localeCompare(b.source);
			return c !== 0 ? c : a.destination.localeCompare(b.destination);
		});

		return res.json({ sources, destinations, pairs });
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};

exports.getSeatStatus = async (req, res) => {
	try {
		const scheduleId = req.params.id;
		const schedule = await Schedule.findById(scheduleId).populate("bus").populate("route");
		if (!schedule) return res.status(404).json({ message: "Schedule not found" });

		// Ensure old locks don't keep seats blocked.
		await cleanupExpiredLocks(scheduleId);

		const totalSeats = schedule.bus?.totalSeats || 0;
		const confirmedBookings = await Booking.find({ schedule: scheduleId, status: "confirmed" }).select("seats");
		const bookedSeats = [...new Set(confirmedBookings.flatMap((b) => b.seats))].sort((a, b) => a - b);

		const locks = await SeatLock.find({ schedule: scheduleId }).select("seatNumber lockedBy lockedAt");
		const lockedSeats = locks
			.map((l) => ({ seatNumber: l.seatNumber, lockedBy: l.lockedBy, lockedAt: l.lockedAt }))
			.sort((a, b) => a.seatNumber - b.seatNumber);

		return res.json({ schedule, totalSeats, bookedSeats, lockedSeats });
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};
