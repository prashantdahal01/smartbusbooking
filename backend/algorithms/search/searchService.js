const mongoose = require("mongoose");
const { routeSegmentService } = require("../routeSegment");
const { SeatLock } = require("../../modules/seatLock/seatLock.model");
const { Booking } = require("../../modules/booking/booking.model");
const { Schedule } = require("../../modules/schedule/schedule.model");

class SearchServiceError extends Error {
  constructor({ status = 500, code = 'SEARCH_SERVICE_ERROR', message = 'Search service error' } = {}) {
    super(message);
    this.name = 'SearchServiceError';
    this.status = status;
    this.code = code;
    this.message = message;
  }
}

const toServiceError = (err) => {
  if (err instanceof SearchServiceError) return err;
  return new SearchServiceError({ status: 500, message: err?.message || 'Internal search error' });
};

const normalizeText = (v) => String(v || "").trim();
const normalizeKey = (v) => normalizeText(v).toLowerCase();

const parseObjectId = (value) => {
  if (!mongoose.isValidObjectId(value)) return null;
  return new mongoose.Types.ObjectId(value);
};

const normalizeStringArray = (value) => {
  if (value === undefined) return undefined;
  let rawItems = value;
  if (typeof rawItems === 'string') {
    rawItems = rawItems.split(',').map((i) => i.trim()).filter(Boolean);
  }
  if (!Array.isArray(rawItems)) return null;
  const seen = new Set();
  const out = [];
  rawItems.forEach((it) => {
    const t = String(it || '').trim();
    if (!t) return;
    const k = normalizeKey(t);
    if (seen.has(k)) return;
    seen.add(k);
    out.push(t);
  });
  return out;
};

const searchSchedules = async ({ query } = {}) => {
  try {
    const rawQuery = query || {};
    const { date, travelDate, busType, operator, minPrice, maxPrice, sortBy, includeRoutePlan } = rawQuery;
    const requestedDate = date ?? travelDate;
    const sourceText = normalizeText(rawQuery.source || rawQuery.from);
    const destText = normalizeText(rawQuery.destination || rawQuery.to);

    if (!sourceText || !destText || requestedDate === undefined) {
      throw new SearchServiceError({
        status: 400,
        code: 'SEARCH_VALIDATION_ERROR',
        message: 'source, destination, and date are required',
      });
    }

    if (normalizeKey(sourceText) === normalizeKey(destText)) {
      throw new SearchServiceError({
        status: 400,
        code: 'SEARCH_VALIDATION_ERROR',
        message: 'source and destination cannot be the same',
      });
    }

    const filter = { isActive: { $ne: false } };
    const requested = normalizeText(requestedDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(requested)) {
      throw new SearchServiceError({ status: 400, code: 'INVALID_DATE', message: 'date must be in YYYY-MM-DD format' });
    }
    filter.date = requested;

    let operatorId = null;
    if (operator !== undefined) {
      operatorId = parseObjectId(operator);
      if (!operatorId) {
        // no results if invalid operator
        return includeRoutePlan ? { schedules: [], routePlan: null } : [];
      }
    }

    // Basic DB query - indexed fields: date, isActive, bus
    const busTypeList = normalizeStringArray(busType);

    // Query schedules and populate bus+route in one go
    const busMatch = {
      isActive: true,
      ...(Array.isArray(busTypeList) && busTypeList.length > 0
        ? { busTypes: { $in: busTypeList.map((t) => t.toUpperCase().replace(/[\s-]+/g, '_')) } }
        : {}),
      ...(operatorId ? { operator: operatorId } : {}),
    };

    const schedules = await Schedule.find(filter)
      .populate({
        path: 'bus',
        match: busMatch,
        populate: { path: 'operator', select: 'name email' },
      })
      .populate('route')
      .lean();

    // keep only schedules with bus present
    const validSchedules = (Array.isArray(schedules) ? schedules : []).filter((s) => Boolean(s?.bus));

    // Route segment validation (forward direction only) if source/destination provided
    const applySegment = Boolean(sourceText || destText);

    let candidateSchedules = validSchedules;
    if (applySegment) {
      const out = [];
      for (const sch of validSchedules) {
        const ok = await routeSegmentService.isValidSegment(sch.route, sourceText, destText, { allowPartial: true, requireBoth: false });
        if (ok) out.push(sch);
      }
      candidateSchedules = out;
    }

    // Inject live availability using aggregations
    const scheduleIds = candidateSchedules.map((s) => (s._id ? s._id : s.id)).filter(Boolean);

    // Booking confirmed counts per schedule
    const bookingAgg = await Booking.aggregate([
      { $match: { schedule: { $in: scheduleIds.map((id) => new mongoose.Types.ObjectId(id)) }, status: 'confirmed' } },
      { $unwind: { path: '$seats', preserveNullAndEmptyArrays: true } },
      { $group: { _id: '$schedule', bookedCount: { $sum: { $cond: [{ $ifNull: ['$seats', false] }, 1, 0] } } } },
    ]);
    const bookedMap = new Map(bookingAgg.map((r) => [String(r._id), Number(r.bookedCount || 0)]));

    // SeatLock aggregation - single pipeline to get locked count per schedule
    const seatLockAgg = await SeatLock.aggregate([
      { $match: { scheduleId: { $in: scheduleIds.map((id) => new mongoose.Types.ObjectId(id)) }, status: 'LOCKED' } },
      { $group: { _id: '$scheduleId', lockedCount: { $sum: 1 } } },
    ]);
    const lockedMap = new Map(seatLockAgg.map((r) => [String(r._id), Number(r.lockedCount || 0)]));

    // Compute available seats for each schedule
    const schedulesWithAvailability = candidateSchedules.map((s) => {
      const totalSeats = Number(s?.bus?.totalSeats) || 0;
      const booked = Number(bookedMap.get(String(s._id)) || 0);
      const locked = Number(lockedMap.get(String(s._id)) || 0);
      const available = Math.max(0, totalSeats - booked - locked);
      return Object.assign({}, s, { _availableSeats: available, _bookedCount: booked, _lockedCount: locked });
    });

    // Apply price range filtering if present
    const minP = Number.isFinite(Number(query?.minPrice)) ? Number(query.minPrice) : null;
    const maxP = Number.isFinite(Number(query?.maxPrice)) ? Number(query.maxPrice) : null;
    let filtered = schedulesWithAvailability;
    if (minP !== null || maxP !== null) {
      filtered = filtered.filter((s) => {
        const p = Number.isFinite(Number(s.price)) ? Number(s.price) : 0;
        if (minP !== null && p < minP) return false;
        if (maxP !== null && p > maxP) return false;
        return true;
      });
    }

    // Sorting
    const sortKey = String(sortBy || 'departure').toLowerCase();
    const compareFns = {
      departure: (a, b) => String(a.time || '').localeCompare(String(b.time || '')),
      price: (a, b) => (Number(a.price || 0) - Number(b.price || 0)),
      duration: (a, b) => (Number(a.durationMinutes || 0) - Number(b.durationMinutes || 0)),
      available: (a, b) => (Number(b._availableSeats || 0) - Number(a._availableSeats || 0)),
    };

    const cmp = compareFns[sortKey] || compareFns.departure;
    filtered.sort((a, b) => {
      // Fully booked go last always
      const aFull = Number(a._availableSeats || 0) === 0;
      const bFull = Number(b._availableSeats || 0) === 0;
      if (aFull !== bFull) return aFull ? 1 : -1;
      const res = cmp(a, b);
      if (typeof res === 'number') return res;
      return res || 0;
    });

    // Keep backward-compatible normalization shape: routeSegmentService.normalizeSchedulesForOutput
    const normalized = routeSegmentService.normalizeSchedulesForOutput(filtered);

    if (includeRoutePlan) {
      // delegate to routePlanningService if caller wants route plan (keep compatibility)
      const routePlanningService = require('../routePlanning').routePlanningService;
      const routePlan = await routePlanningService.getRoutePlan({ source: sourceText, destination: destText, requireBoth: false });
      return { schedules: normalized, routePlan };
    }

    return normalized;
  } catch (error) {
    throw toServiceError(error);
  }
};

const formatError = (error) => {
  const mapped = error instanceof SearchServiceError ? error : toServiceError(error);
  return { code: mapped.code, status: mapped.status, message: mapped.message };
};

const isSearchError = (err) => err instanceof SearchServiceError;

module.exports = {
  searchSchedules,
  formatError,
  isSearchError,
  SearchServiceError,
};
