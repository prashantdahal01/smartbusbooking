const { normalizeSeatLabel } = require("../seat/seat.utils");

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
  const normalizedSeats = (Array.isArray(seatLabels) ? seatLabels : [])
    .map((seat) => normalizeSeatLabel(seat))
    .filter(Boolean);
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

const parseDateStartMs = (date) => {
  const safeDate = String(date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(safeDate)) return NaN;
  return new Date(`${safeDate}T00:00:00`).getTime();
};

const getTodayStartMs = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.getTime();
};

module.exports = {
  parsePassenger,
  parsePassengers,
  pickSchedulePoint,
  parseIsoDateTimeMs,
  parseDateStartMs,
  getTodayStartMs,
  stopKey,
};
