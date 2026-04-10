// Handles admin-level operations: managing users, buses, routes, and schedules
const Bus = require("../models/Bus");
const Route = require("../models/Route");
const Schedule = require("../models/Schedule");
const User = require("../models/User");

const stopKey = (s) => String(s || "").trim().toLowerCase();

const toStopName = (raw) => {
  if (raw === null || raw === undefined) return "";
  if (typeof raw === "string") return raw;
  if (typeof raw === "object") return raw.name;
  return "";
};

const toStopKmFromSource = (raw) => {
  if (!raw || typeof raw !== "object") return undefined;
  if (raw.kmFromSource !== undefined) return raw.kmFromSource;
  // tolerate alternative keys from clients
  if (raw.distanceFromSourceKm !== undefined) return raw.distanceFromSourceKm;
  if (raw.km !== undefined) return raw.km;
  return undefined;
};

const normalizeRouteStops = ({ stops, source, destination, distance }) => {
  if (stops === undefined) return { ok: true, value: undefined };
  if (!Array.isArray(stops)) return { ok: false, message: "stops must be an array" };

  const srcKey = stopKey(source);
  const dstKey = stopKey(destination);
  const totalKm = Number(distance);
  const hasTotalKm = Number.isFinite(totalKm) && totalKm > 0;

  const seen = new Set();
  const out = [];
  let lastDefinedKm = null;

  for (const raw of stops) {
    const name = String(toStopName(raw) || "").trim();
    if (!name) continue;
    const k = stopKey(name);
    if (!k) continue;
    if (k === srcKey || k === dstKey) continue;
    if (seen.has(k)) continue;
    seen.add(k);

    let km = toStopKmFromSource(raw);
    if (km !== undefined && km !== null && km !== "") {
      km = Number(km);
      if (!Number.isFinite(km)) return { ok: false, message: `Invalid kmFromSource for stop: ${name}` };
      if (km <= 0) return { ok: false, message: `kmFromSource must be > 0 for stop: ${name}` };
      if (hasTotalKm && km >= totalKm) return { ok: false, message: `kmFromSource must be < route distance for stop: ${name}` };
      if (lastDefinedKm !== null && km <= lastDefinedKm) {
        return { ok: false, message: "Stop kmFromSource values must be increasing in route order" };
      }
      lastDefinedKm = km;
    } else {
      km = undefined;
    }

    const stop = { name };
    if (km !== undefined) stop.kmFromSource = km;
    out.push(stop);
  }

  return { ok: true, value: out };
};

const normalizePointList = (points) => {
  if (points === undefined) return undefined;
  if (!Array.isArray(points)) return null;
  const seen = new Set();
  const out = [];
  for (const p of points) {
    if (!p || typeof p !== "object") return null;
    const name = String(p.name || "").trim();
    const date = String(p.date || "").trim();
    const time = String(p.time || "").trim();
    if (!name || !date || !time) return null;
    const k = stopKey(name);
    if (!k) return null;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ name, date, time });
  }
  return out;
};

const toIsoDateTimeMs = (date, time) => {
  const d = String(date || "").trim();
  const t = String(time || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(t)) return NaN;
  return new Date(`${d}T${t}:00`).getTime();
};

const buildStopIndexByKeyFromRoute = (route) => {
  const src = String(route?.source || "").trim();
  const dst = String(route?.destination || "").trim();
  const midsRaw = Array.isArray(route?.stops) ? route.stops : [];
  const mids = midsRaw.map((s) => String(toStopName(s) || "").trim()).filter(Boolean);
  const list = [src, ...mids, dst].map((s) => String(s || "").trim()).filter(Boolean);
  const map = new Map();
  list.forEach((s, idx) => {
    const k = stopKey(s);
    if (!k) return;
    if (!map.has(k)) map.set(k, idx);
  });
  return map;
};

const validatePointOrderAndTime = (points, stopIndexByKey) => {
  const enriched = points.map((p) => ({ ...p, idx: stopIndexByKey.get(stopKey(p.name)) }));
  const unknown = enriched.find((p) => p.idx === undefined);
  if (unknown) return { ok: false, message: `Point not found in route stops: ${unknown.name}` };
  enriched.sort((a, b) => a.idx - b.idx);
  let prev = null;
  for (const p of enriched) {
    const ms = toIsoDateTimeMs(p.date, p.time);
    if (!Number.isFinite(ms)) return { ok: false, message: `Invalid date/time for: ${p.name}` };
    if (prev !== null && ms < prev) return { ok: false, message: `Times must follow route order (check: ${p.name})` };
    prev = ms;
  }
  return { ok: true };
};

// BUS
exports.createBus = async (req, res) => {
  try {
    const { name, type, operator, vehicleNumber } = req.body || {};
    const totalSeatsRaw = req.body?.totalSeats;
    const totalSeats = totalSeatsRaw !== undefined && totalSeatsRaw !== null && totalSeatsRaw !== "" ? Number(totalSeatsRaw) : undefined;
    const imageUrl = req.file ? `/uploads/buses/${req.file.filename}` : req.body?.imageUrl;

    const bus = await Bus.create({
      name,
      type,
      vehicleNumber: vehicleNumber || undefined,
      totalSeats,
      operator: operator || undefined,
      imageUrl: imageUrl || undefined,
    });
    res.status(201).json(bus);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getBuses = async (req, res) => {
  const buses = await Bus.find().populate("operator");
  res.json(buses);
};

exports.updateBus = async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.totalSeats !== undefined && updates.totalSeats !== null && updates.totalSeats !== "") {
      updates.totalSeats = Number(updates.totalSeats);
    }
    if (req.file) {
      updates.imageUrl = `/uploads/buses/${req.file.filename}`;
    }
    if (updates.operator === "") updates.operator = undefined;
    if (updates.vehicleNumber === "") updates.vehicleNumber = undefined;
    const bus = await Bus.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json(bus);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.deleteBus = async (req, res) => {
  await Bus.findByIdAndDelete(req.params.id);
  res.json({ message: "Deleted" });
};

// ROUTE
exports.createRoute = async (req, res) => {
  try {
    const body = { ...req.body };
    body.source = String(body.source || "").trim();
    body.destination = String(body.destination || "").trim();
    if (body.distance !== undefined && body.distance !== null && body.distance !== "") body.distance = Number(body.distance);

    if (!body.source || !body.destination) {
      return res.status(400).json({ message: "source and destination are required" });
    }
    if (!Number.isFinite(body.distance) || body.distance <= 0) {
      return res.status(400).json({ message: "distance must be a positive number" });
    }

    const normalizedStops = normalizeRouteStops({
      stops: body.stops,
      source: body.source,
      destination: body.destination,
      distance: body.distance,
    });
    if (!normalizedStops.ok) {
      return res.status(400).json({ message: normalizedStops.message });
    }
    if (normalizedStops.value !== undefined) body.stops = normalizedStops.value;

    const route = await Route.create(body);
    res.status(201).json(route);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getRoutes = async (req, res) => {
  const routes = await Route.find();
  res.json(routes);
};

exports.updateRoute = async (req, res) => {
  try {
    const existing = await Route.findById(req.params.id);
    if (!existing) return res.status(404).json({ message: "Route not found" });

    const body = { ...req.body };
    const nextSource = body.source !== undefined ? String(body.source || "").trim() : String(existing.source || "").trim();
    const nextDestination =
      body.destination !== undefined ? String(body.destination || "").trim() : String(existing.destination || "").trim();
    const nextDistance =
      body.distance !== undefined && body.distance !== null && body.distance !== "" ? Number(body.distance) : Number(existing.distance);

    if (!nextSource || !nextDestination) {
      return res.status(400).json({ message: "source and destination are required" });
    }
    if (!Number.isFinite(nextDistance) || nextDistance <= 0) {
      return res.status(400).json({ message: "distance must be a positive number" });
    }

    const updates = {
      ...body,
      source: nextSource,
      destination: nextDestination,
      distance: nextDistance,
    };

    const normalizedStops = normalizeRouteStops({
      stops: body.stops !== undefined ? body.stops : undefined,
      source: nextSource,
      destination: nextDestination,
      distance: nextDistance,
    });
    if (!normalizedStops.ok) {
      return res.status(400).json({ message: normalizedStops.message });
    }
    if (normalizedStops.value !== undefined) updates.stops = normalizedStops.value;

    const route = await Route.findByIdAndUpdate(req.params.id, updates, { new: true });
    res.json(route);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// SCHEDULE
exports.createSchedule = async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.price !== undefined && body.price !== null && body.price !== "") body.price = Number(body.price);
    if (body.priceMin !== undefined && body.priceMin !== null && body.priceMin !== "") body.priceMin = Number(body.priceMin);
    if (body.priceMax !== undefined && body.priceMax !== null && body.priceMax !== "") body.priceMax = Number(body.priceMax);
    if (body.durationMinutes !== undefined && body.durationMinutes !== null && body.durationMinutes !== "") body.durationMinutes = Number(body.durationMinutes);

    delete body.womenOnlySeats;

    const boardingPoints = normalizePointList(body.boardingPoints);
    if (boardingPoints === null) {
      return res.status(400).json({ message: "boardingPoints must be an array of {name,date,time}" });
    }
    const droppingPoints = normalizePointList(body.droppingPoints);
    if (droppingPoints === null) {
      return res.status(400).json({ message: "droppingPoints must be an array of {name,date,time}" });
    }
    if (!Array.isArray(boardingPoints) || boardingPoints.length === 0) {
      return res.status(400).json({ message: "At least one boarding point is required" });
    }
    if (!Array.isArray(droppingPoints) || droppingPoints.length === 0) {
      return res.status(400).json({ message: "At least one dropping point is required" });
    }

    const route = await Route.findById(body.route);
    if (!route) {
      return res.status(400).json({ message: "Route not found" });
    }
    const stopIndexByKey = buildStopIndexByKeyFromRoute(route);
    const boardingValidation = validatePointOrderAndTime(boardingPoints, stopIndexByKey);
    if (!boardingValidation.ok) {
      return res.status(400).json({ message: `Boarding points: ${boardingValidation.message}` });
    }
    const droppingValidation = validatePointOrderAndTime(droppingPoints, stopIndexByKey);
    if (!droppingValidation.ok) {
      return res.status(400).json({ message: `Dropping points: ${droppingValidation.message}` });
    }

    body.boardingPoints = boardingPoints;
    body.droppingPoints = droppingPoints;

    const schedule = await Schedule.create(body);
    res.status(201).json(schedule);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.updateSchedule = async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.price !== undefined && body.price !== null && body.price !== "") body.price = Number(body.price);
    if (body.priceMin !== undefined && body.priceMin !== null && body.priceMin !== "") body.priceMin = Number(body.priceMin);
    if (body.priceMax !== undefined && body.priceMax !== null && body.priceMax !== "") body.priceMax = Number(body.priceMax);
    if (body.durationMinutes !== undefined && body.durationMinutes !== null && body.durationMinutes !== "") body.durationMinutes = Number(body.durationMinutes);

    delete body.womenOnlySeats;

    const boardingPoints = normalizePointList(body.boardingPoints);
    if (boardingPoints === null) {
      return res.status(400).json({ message: "boardingPoints must be an array of {name,date,time}" });
    }
    const droppingPoints = normalizePointList(body.droppingPoints);
    if (droppingPoints === null) {
      return res.status(400).json({ message: "droppingPoints must be an array of {name,date,time}" });
    }
    if (!Array.isArray(boardingPoints) || boardingPoints.length === 0) {
      return res.status(400).json({ message: "At least one boarding point is required" });
    }
    if (!Array.isArray(droppingPoints) || droppingPoints.length === 0) {
      return res.status(400).json({ message: "At least one dropping point is required" });
    }

    const route = await Route.findById(body.route);
    if (!route) {
      return res.status(400).json({ message: "Route not found" });
    }
    const stopIndexByKey = buildStopIndexByKeyFromRoute(route);
    const boardingValidation = validatePointOrderAndTime(boardingPoints, stopIndexByKey);
    if (!boardingValidation.ok) {
      return res.status(400).json({ message: `Boarding points: ${boardingValidation.message}` });
    }
    const droppingValidation = validatePointOrderAndTime(droppingPoints, stopIndexByKey);
    if (!droppingValidation.ok) {
      return res.status(400).json({ message: `Dropping points: ${droppingValidation.message}` });
    }

    body.boardingPoints = boardingPoints;
    body.droppingPoints = droppingPoints;

    const schedule = await Schedule.findByIdAndUpdate(req.params.id, body, { new: true });
    res.json(schedule);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.getSchedules = async (req, res) => {
  try {
    const schedules = await Schedule.find()
      .populate("bus")
      .populate("route")
      .sort({ date: 1, time: 1 });
    res.json(schedules);
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

exports.deleteSchedule = async (req, res) => {
  try {
    await Schedule.findByIdAndDelete(req.params.id);
    res.json({ message: "Deleted" });
  } catch (e) {
    res.status(500).json({ message: e.message });
  }
};

// USERS
exports.getUsers = async (req, res) => {
  const users = await User.find().select("-password");
  res.json(users);
};