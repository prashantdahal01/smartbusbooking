// Handles operator-scoped CRUD operations for buses
const mongoose = require("mongoose");
const Bus = require("../models/Bus");
const Schedule = require("../models/Schedule");

const BUS_TYPES = new Set(Bus.BUS_TYPES || [
	"SLEEPER",
	"SINGLE_SLEEPER",
	"DOUBLE_SLEEPER",
	"CABIN_SLEEPER",
	"SINGLE_SEATER",
	"AC",
	"SOFA_SEATER",
]);

const SIMPLE_BUS_TYPE_MAP = {
	AC: ["AC", "SINGLE_SEATER"],
	NON_AC: ["SINGLE_SEATER"],
	SLEEPER: ["AC", "SLEEPER"],
};

const toSafeText = (value) => String(value || "").trim();

const normalizeBusTypeToken = (value) =>
	String(value || "")
		.trim()
		.toUpperCase()
		.replace(/[\s-]+/g, "_");

const normalizeSimpleType = (value) => {
	const token = normalizeBusTypeToken(value);
	if (!token) return null;
	if (token === "NON_AC" || token === "NONAC") return "NON_AC";
	if (token === "SLEEPER") return "SLEEPER";
	if (token === "AC") return "AC";
	return null;
};

const normalizeBusTypes = (rawTypes) => {
	if (!Array.isArray(rawTypes)) return null;

	const seen = new Set();
	const types = [];

	rawTypes.forEach((value) => {
		const token = normalizeBusTypeToken(value);
		if (!token || seen.has(token)) return;
		seen.add(token);
		types.push(token);
	});

	if (types.length === 0) return null;

	const invalid = types.find((type) => !BUS_TYPES.has(type));
	if (invalid) {
		return { error: `Invalid bus type: ${invalid}` };
	}

	return types;
};

const parsePositiveInt = (value) => {
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed <= 0) return null;
	return Math.trunc(parsed);
};

const parsePhone = (value) => {
	const phone = toSafeText(value);
	if (!phone) return "";
	const digitCount = phone.replace(/\D/g, "").length;
	return digitCount >= 7 ? phone : null;
};

const resolveBusTypesFromPayload = ({ body, partial }) => {
	if (body.busTypes !== undefined) {
		const normalized = normalizeBusTypes(body.busTypes);
		if (!normalized) return { ok: false, message: "busTypes must be a non-empty array" };
		if (normalized?.error) return { ok: false, message: normalized.error };
		return { ok: true, busTypes: normalized };
	}

	if (body.type !== undefined || !partial) {
		const simpleType = normalizeSimpleType(body.type || "AC");
		if (!simpleType) {
			return { ok: false, message: "type must be one of AC, NON_AC, or SLEEPER" };
		}
		return { ok: true, busTypes: SIMPLE_BUS_TYPE_MAP[simpleType] };
	}

	return { ok: true };
};

const parseOperatorBusPayload = ({ body = {}, partial = false } = {}) => {
	const payload = body || {};
	const updates = {};

	if (!partial || payload.name !== undefined) {
		const name = toSafeText(payload.name);
		if (!name) return { ok: false, message: "Bus name is required" };
		updates.name = name;
	}

	if (!partial || payload.vehicleNumber !== undefined) {
		const vehicleNumber = toSafeText(payload.vehicleNumber);
		if (!vehicleNumber) return { ok: false, message: "Bus number is required" };
		updates.vehicleNumber = vehicleNumber;
	}

	if (!partial || payload.phone !== undefined) {
		const parsedPhone = parsePhone(payload.phone);
		if (parsedPhone === null) {
			return { ok: false, message: "Phone number must contain at least 7 digits" };
		}
		if (!parsedPhone) {
			return { ok: false, message: "Operator contact phone is required" };
		}
		updates.phone = parsedPhone;
	}

	if (!partial || payload.totalSeats !== undefined) {
		const totalSeats = parsePositiveInt(payload.totalSeats);
		if (!totalSeats) {
			return { ok: false, message: "totalSeats must be a positive integer" };
		}
		updates.totalSeats = totalSeats;
	}

	const busTypeResult = resolveBusTypesFromPayload({ body: payload, partial });
	if (!busTypeResult.ok) return busTypeResult;
	if (Array.isArray(busTypeResult.busTypes)) {
		updates.busTypes = busTypeResult.busTypes;
	}

	return { ok: true, updates };
};

const parseObjectId = (value) => {
	if (!mongoose.isValidObjectId(value)) return null;
	return new mongoose.Types.ObjectId(value);
};

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

exports.getOperatorBuses = async (req, res) => {
	try {
		const operatorId = parseObjectId(req.user?.id);
		if (!operatorId) {
			return res.status(401).json({ message: "Unauthorized" });
		}

		const buses = await Bus.find({ operator: operatorId }).sort({ name: 1 }).lean();
		const busIds = buses.map((bus) => bus._id).filter(Boolean);

		const scheduleCounts = busIds.length > 0
			? await Schedule.aggregate([
				{ $match: { bus: { $in: busIds } } },
				{ $group: { _id: "$bus", count: { $sum: 1 } } },
			])
			: [];

		const countByBusId = new Map(
			scheduleCounts.map((item) => [String(item?._id), Number(item?.count) || 0])
		);

		const output = buses.map((bus) => ({
			...bus,
			scheduleCount: countByBusId.get(String(bus._id)) || 0,
		}));

		return res.json(output);
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};

exports.createOperatorBus = async (req, res) => {
	try {
		return res.status(403).json({
			message: "Operators cannot create buses. Please contact admin.",
		});
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};

exports.updateOperatorBus = async (req, res) => {
	try {
		const operatorId = parseObjectId(req.user?.id);
		if (!operatorId) {
			return res.status(401).json({ message: "Unauthorized" });
		}

		const busId = parseObjectId(req.params.id);
		if (!busId) {
			return res.status(400).json({ message: "Invalid bus id" });
		}

		const blockedFieldMessages = {
			totalSeats: "Only admin can modify seat capacity",
			decks: "Only admin can modify seat layout",
			seatLayout: "Only admin can modify seat layout",
			vehicleNumber: "Only admin can modify vehicle number",
		};

		const attemptedBlockedField = Object.keys(blockedFieldMessages).find((field) =>
			hasOwn(req.body, field)
		);

		if (attemptedBlockedField) {
			return res.status(403).json({
				message: blockedFieldMessages[attemptedBlockedField],
			});
		}

		const editablePayload = {};
		if (hasOwn(req.body, "name")) editablePayload.name = req.body.name;
		if (hasOwn(req.body, "type")) editablePayload.type = req.body.type;
		if (hasOwn(req.body, "busTypes")) editablePayload.busTypes = req.body.busTypes;
		if (hasOwn(req.body, "phone")) editablePayload.phone = req.body.phone;

		const parsed = parseOperatorBusPayload({ body: editablePayload, partial: true });
		if (!parsed.ok) {
			return res.status(400).json({ message: parsed.message || "Invalid bus payload" });
		}

		if (Object.keys(parsed.updates).length === 0) {
			return res.status(400).json({ message: "No valid fields provided" });
		}

		const bus = await Bus.findOneAndUpdate(
			{ _id: busId, operator: operatorId },
			parsed.updates,
			{ new: true, runValidators: true }
		);

		if (!bus) {
			return res.status(404).json({ message: "Bus not found" });
		}

		return res.json(bus);
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};

exports.deleteOperatorBus = async (req, res) => {
	try {
		return res.status(403).json({
			message: "Operators cannot delete buses. Please contact admin.",
		});
	} catch (e) {
		return res.status(500).json({ message: e.message });
	}
};
