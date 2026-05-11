const crypto = require("crypto");
const mongoose = require("mongoose");

const { Booking, Schedule } = require("./payment.model");
const { seatLockService } = require("../../algorithms/seatLock");
const { sendTicketEmailSafely } = require("../../utils/mailer");
const { createAdminNotification } = require("../../services/notification.service");
const { buildRouteOrderIndex, normalizeKey } = require("../../utils/routePoints");
const {
  BOOKING_STATUS,
  PAYMENT_STATUS,
  normalizeBookingDocument,
  isRetryablePendingBooking,
} = require("../../utils/bookingState");
const { ApiError } = require("../../utils/apiError");
const {
  normalizeSeatLabel,
  sortSeatLabels,
  toFinitePrice,
  buildSeatCatalog,
  validateSeatSelection,
  buildSeatPriceBreakdown,
  buildSeatQueryValues,
  parseSeats,
} = require("../seat/seat.utils");
const {
  parsePassenger,
  parsePassengers,
  pickSchedulePoint,
  parseIsoDateTimeMs,
  parseDateStartMs,
  getTodayStartMs,
  stopKey,
} = require("../booking/booking.utils");

const DEFAULT_SEAT_PRICE = 0;

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

const shouldLogEsewa = () => String(process.env.ESEWA_DEBUG || "").trim().toLowerCase() === "true";

const logEsewa = (message, payload) => {
  if (!shouldLogEsewa()) return;
  // eslint-disable-next-line no-console
  console.info(`[eSewa] ${message}`, payload);
};

const formatEsewaAmount = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error("Invalid eSewa amount");
  }
  return numeric.toFixed(2);
};

const validateEsewaFields = (fields) => {
  const required = ["amount", "tax_amount", "total_amount", "transaction_uuid", "product_code", "success_url", "failure_url"];
  required.forEach((key) => {
    if (!String(fields?.[key] || "").trim()) {
      throw new Error(`eSewa field missing: ${key}`);
    }
  });

  const amount = Number(fields.amount);
  const tax = Number(fields.tax_amount);
  const total = Number(fields.total_amount);
  if (!Number.isFinite(amount) || !Number.isFinite(tax) || !Number.isFinite(total)) {
    throw new Error("Invalid eSewa amount fields");
  }

  const sum = Number((amount + tax).toFixed(2));
  if (Number(total.toFixed(2)) !== sum) {
    throw new Error("eSewa total_amount must equal amount + tax_amount");
  }
};

const decodeEsewaData = (data) => {
  if (!data) return null;
  let b64 = String(data).trim();
  b64 = b64.replace(/ /g, "+");
  b64 = b64.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  if (pad) b64 += "=".repeat(4 - pad);
  const text = Buffer.from(b64, "base64").toString("utf8");
  return JSON.parse(text);
};

const splitBookingIdParam = (bookingIdRaw) => {
  const text = String(bookingIdRaw || "").trim();
  if (!text) return { bookingId: "", extraParams: {} };
  const idx = text.search(/[?&]/);
  if (idx === -1) return { bookingId: text, extraParams: {} };
  const bookingId = text.slice(0, idx);
  const queryPart = text.slice(idx + 1);
  const extraParams = {};
  if (queryPart) {
    const params = new URLSearchParams(queryPart);
    for (const [key, value] of params.entries()) {
      if (key && !(key in extraParams)) extraParams[key] = value;
    }
  }
  return { bookingId, extraParams };
};

const normalizeEsewaQuery = (query) => {
  const safeQuery = query && typeof query === "object" ? { ...query } : {};
  if (safeQuery.bookingId) {
    const { bookingId, extraParams } = splitBookingIdParam(safeQuery.bookingId);
    if (bookingId) safeQuery.bookingId = bookingId;
    if (!safeQuery.data && extraParams.data) safeQuery.data = extraParams.data;
  }
  return safeQuery;
};

const buildDecodedFromQuery = (query = {}) => {
  const safeQuery = query && typeof query === "object" ? query : {};
  return {
    transaction_uuid: safeQuery.transaction_uuid || safeQuery.transactionUuid || safeQuery.oid || "",
    total_amount: safeQuery.total_amount || safeQuery.totalAmount || safeQuery.amt || safeQuery.amount || "",
    product_code: safeQuery.product_code || safeQuery.productCode || safeQuery.pid || "",
    status: safeQuery.status || safeQuery.transaction_status || safeQuery.status_code || "",
    signature: safeQuery.signature || safeQuery.sig || "",
    ref_id: safeQuery.ref_id || safeQuery.refId || "",
  };
};

const extractEsewaCallback = (query) => {
  if (!query || typeof query !== "object") return null;
  const normalizedQuery = normalizeEsewaQuery(query);
  if (normalizedQuery.data) {
    try {
      return decodeEsewaData(normalizedQuery.data);
    } catch {
      return buildDecodedFromQuery(normalizedQuery);
    }
  }
  return buildDecodedFromQuery(normalizedQuery);
};

const checkEsewaStatus = async ({ statusUrlBase, productCode, totalAmount, transactionUuid }) => {
  const u = new URL(statusUrlBase);
  const totalAmountText = formatEsewaAmount(totalAmount);
  u.searchParams.set("product_code", String(productCode));
  u.searchParams.set("total_amount", totalAmountText);
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

const ESEWA_SUCCESS_STATUSES = new Set(["COMPLETE", "COMPLETED", "SUCCESS", "SUCCESSFUL"]);
const ESEWA_PENDING_STATUSES = new Set(["PENDING", "INITIATED", "PROCESSING", "INCOMPLETE"]);
const ESEWA_INDETERMINATE_STATUSES = new Set(["NOT_FOUND", "UNKNOWN"]);
const ESEWA_FAILURE_STATUSES = new Set(["FAILED", "FAIL", "FAILURE", "REJECTED", "DECLINED", "CANCELLED", "CANCELED"]);

const normalizeEsewaStatus = (value) => String(value || "").trim().toUpperCase();

const isEsewaSuccessfulStatus = (value) => ESEWA_SUCCESS_STATUSES.has(normalizeEsewaStatus(value));
const isEsewaPendingStatus = (value) => ESEWA_PENDING_STATUSES.has(normalizeEsewaStatus(value));
const isEsewaIndeterminateStatus = (value) => ESEWA_INDETERMINATE_STATUSES.has(normalizeEsewaStatus(value));
const isEsewaFailureStatus = (value) => ESEWA_FAILURE_STATUSES.has(normalizeEsewaStatus(value));

const isEsewaCallbackSignatureValid = ({ total_amount, transaction_uuid, product_code, signature }, secretKey) => {
  const expected = makeSignature({
    totalAmount: total_amount,
    transactionUuid: transaction_uuid,
    productCode: product_code,
    secretKey,
  });
  const received = String(signature || "").trim();
  if (!expected || !received || expected.length !== received.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
};

const isEsewaTrustedSuccess = (decoded, secretKey) => {
  if (!decoded || typeof decoded !== "object") return false;
  if (!isEsewaSuccessfulStatus(decoded.status)) return false;
  if (!String(decoded.transaction_uuid || "").trim()) return false;
  if (!String(decoded.product_code || "").trim()) return false;
  if (!String(decoded.total_amount || "").trim()) return false;
  return isEsewaCallbackSignatureValid(decoded, secretKey);
};

const getBookingScheduleId = (booking) => booking?.schedule?._id || booking?.schedule;

const isScheduleUnavailable = (schedule) => {
  const scheduleDateMs = parseDateStartMs(schedule?.date);
  return schedule?.isActive === false
    || schedule?.bus?.isActive === false
    || !Number.isFinite(scheduleDateMs)
    || scheduleDateMs < getTodayStartMs();
};

const ensureBookingStateNormalized = async (booking) => {
  const normalized = normalizeBookingDocument(booking);
  if (normalized.changed) {
    await booking.save();
  }
  return normalized;
};

const validateBookingLocks = async (booking, userId) => {
  return seatLockService.validateLocks({
    scheduleId: getBookingScheduleId(booking),
    seats: booking?.seats,
    userId: userId || booking?.user?._id || booking?.user,
  });
};

const releaseBookingLocks = async (booking) => {
  await seatLockService.releaseLocks({
    scheduleId: getBookingScheduleId(booking),
    seats: booking?.seats,
    allowEmptySeats: true,
  }).catch(() => {});
};

const markBookingCancelled = async (booking, { gatewayStatus = "LOCK_EXPIRED", raw = null } = {}) => {
  booking.payment = booking.payment || { provider: "esewa" };
  booking.status = BOOKING_STATUS.CANCELLED;
  booking.payment.status = PAYMENT_STATUS.FAILED;
  booking.payment.gatewayStatus = gatewayStatus;
  if (raw) booking.payment.raw = raw;
  await booking.save();
  await releaseBookingLocks(booking);
};

const markBookingFailedForRetry = async (booking, { gatewayStatus = "PAYMENT_FAILED", raw = null } = {}) => {
  booking.payment = booking.payment || { provider: "esewa" };
  booking.status = BOOKING_STATUS.PENDING;
  booking.payment.status = PAYMENT_STATUS.FAILED;
  booking.payment.gatewayStatus = gatewayStatus;
  if (raw) booking.payment.raw = raw;
  await booking.save();
};

const buildEsewaFormFields = ({ booking, productCode, secretKey }) => {
  const publicBaseUrl = getPublicBaseUrl();
  const totalAmount = booking.payment?.totalAmount ?? booking.totalPrice;
  const transactionUuid = booking.payment?.transactionUuid;

  if (!transactionUuid) {
    throw new Error("Payment transaction UUID missing");
  }

  const amount = formatEsewaAmount(totalAmount);
  const taxAmount = formatEsewaAmount(0);
  const totalAmountText = formatEsewaAmount(Number(amount) + Number(taxAmount));

  const signedFieldNames = "total_amount,transaction_uuid,product_code";
  const signature = makeSignature({
    totalAmount: totalAmountText,
    transactionUuid,
    productCode,
    secretKey,
  });

  const fields = {
    amount,
    tax_amount: taxAmount,
    product_service_charge: "0",
    product_delivery_charge: "0",
    total_amount: totalAmountText,
    transaction_uuid: String(transactionUuid),
    product_code: String(productCode),
    success_url: `${publicBaseUrl}/api/payments/esewa/success?bookingId=${encodeURIComponent(String(booking?._id || ""))}`,
    failure_url: `${publicBaseUrl}/api/payments/esewa/failure?bookingId=${encodeURIComponent(String(booking?._id || ""))}`,
    signed_field_names: signedFieldNames,
    signature,
  };

  validateEsewaFields(fields);

  logEsewa("Prepared payment form", {
    amount: fields.amount,
    tax_amount: fields.tax_amount,
    total_amount: fields.total_amount,
    transaction_uuid: fields.transaction_uuid,
    product_code: fields.product_code,
    success_url: fields.success_url,
    failure_url: fields.failure_url,
  });

  return fields;
};

const initiateEsewaPayment = async ({ userId, body }) => {
  const { scheduleId, seats } = body || {};
  const normalizedSeats = parseSeats(seats);
  if (!scheduleId || !normalizedSeats) {
    throw new ApiError(400, "scheduleId and seats[] are required", null);
  }

  const boardingPointName = String(body?.boardingPoint || "").trim();
  const droppingPointName = String(body?.droppingPoint || "").trim();
  if (!boardingPointName || !droppingPointName) {
    throw new ApiError(400, "boardingPoint and droppingPoint are required", null);
  }
  if (stopKey(boardingPointName) === stopKey(droppingPointName)) {
    throw new ApiError(400, "Dropping point must be different from boarding point", null);
  }

  const passenger = parsePassenger(body?.passenger);
  if (!passenger) {
    throw new ApiError(400, "passenger{name,age,gender,phone} is required", null);
  }

  const passengersResult = parsePassengers({
    passengers: body?.passengers,
    seatLabels: normalizedSeats,
    fallbackPassenger: passenger,
  });
  if (!passengersResult.ok) {
    throw new ApiError(400, passengersResult.message, null);
  }
  const passengers = passengersResult.value;

  const { productCode, secretKey, formUrl } = getEsewaConfig();

  const schedule = await Schedule.findById(scheduleId).populate("bus").populate("route");
  if (!schedule) throw new ApiError(404, "Schedule not found", null);
  if (!schedule.route) throw new ApiError(400, "Schedule route missing", null);
  if (!schedule.bus) throw new ApiError(400, "Schedule bus not configured", null);
  if (schedule?.isActive === false) {
    throw new ApiError(400, "Schedule is no longer active", null);
  }
  if (schedule?.bus?.isActive === false) {
    throw new ApiError(400, "Selected bus is no longer available", null);
  }

  const scheduleDateMs = parseDateStartMs(schedule?.date);
  if (!Number.isFinite(scheduleDateMs)) {
    throw new ApiError(400, "Schedule travel date is invalid", null);
  }
  if (scheduleDateMs < getTodayStartMs()) {
    throw new ApiError(400, "Cannot book past schedules", null);
  }

  const selectedBoardingPoint = pickSchedulePoint(schedule.boardingPoints, boardingPointName);
  if (!selectedBoardingPoint) {
    throw new ApiError(400, "Invalid boarding point", null);
  }
  const selectedDroppingPoint = pickSchedulePoint(schedule.droppingPoints, droppingPointName);
  if (!selectedDroppingPoint) {
    throw new ApiError(400, "Invalid dropping point", null);
  }

  const routeOrderIndex = buildRouteOrderIndex(schedule.route || {});
  const bIdx = routeOrderIndex.get(normalizeKey(selectedBoardingPoint.name))
    ?? routeOrderIndex.get(stopKey(selectedBoardingPoint.name));
  const dIdx = routeOrderIndex.get(normalizeKey(selectedDroppingPoint.name))
    ?? routeOrderIndex.get(stopKey(selectedDroppingPoint.name));
  if (bIdx === undefined || dIdx === undefined) {
    throw new ApiError(400, "Selected points must exist in the route stop list", null);
  }
  if (dIdx <= bIdx) {
    throw new ApiError(400, "Dropping point must be after boarding point", null);
  }

  const boardingMs = parseIsoDateTimeMs(selectedBoardingPoint.date, selectedBoardingPoint.time);
  const droppingMs = parseIsoDateTimeMs(selectedDroppingPoint.date, selectedDroppingPoint.time);
  if (!Number.isFinite(boardingMs) || !Number.isFinite(droppingMs)) {
    throw new ApiError(400, "Selected points must have valid date and time", null);
  }
  if (droppingMs <= boardingMs) {
    throw new ApiError(400, "Dropping time must be after boarding time", null);
  }

  const seatCatalog = buildSeatCatalog(schedule.bus, DEFAULT_SEAT_PRICE);
  if (seatCatalog.size <= 0) {
    throw new ApiError(400, "No seat layout configured for this bus", null);
  }

  const { invalidSeats, unavailableSeats } = validateSeatSelection(seatCatalog, normalizedSeats);
  if (invalidSeats.length > 0) {
    throw new ApiError(400, "One or more seats are invalid", { invalidSeats });
  }
  if (unavailableSeats.length > 0) {
    throw new ApiError(400, "One or more seats are currently unavailable", { unavailableSeats });
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
    throw new ApiError(409, "Some seats already booked", { bookedSeats });
  }

  const lockValidation = await seatLockService.validateLocks({
    scheduleId,
    seats: normalizedSeats,
    userId,
  });
  if (!lockValidation.valid) {
    const missingLocks = [...lockValidation.missingLocks, ...lockValidation.conflictSeats].sort(sortSeatLabels);
    throw new ApiError(409, "Seat lock required before payment. Missing locks", {
      missingLocks,
      conflictSeats: lockValidation.conflictSeats,
      failedSeats: missingLocks,
    });
  }

  const lockResult = await seatLockService.lockSeats({
    scheduleId,
    seats: normalizedSeats,
    userId,
    sessionId: body?.sessionId,
  });

  const seatPriceBreakdown = buildSeatPriceBreakdown(normalizedSeats, seatCatalog);
  const totalPrice = seatPriceBreakdown.reduce((sum, seat) => sum + toFinitePrice(seat.price), 0);
  const pricePerSeat = normalizedSeats.length > 0 ? Number((totalPrice / normalizedSeats.length).toFixed(2)) : 0;
  if (!Number.isFinite(totalPrice) || totalPrice <= 0) {
    throw new ApiError(400, "Invalid schedule price", null);
  }

  let booking = await Booking.findOne({
    user: userId,
    schedule: scheduleId,
    seats: normalizedSeats,
    status: { $in: [BOOKING_STATUS.PENDING, "payment_pending", "payment_failed"] },
    "payment.provider": "esewa",
    "payment.status": { $in: [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.FAILED, "initiated"] },
  }).sort({ createdAt: -1 });

  if (!booking) {
    booking = await Booking.create({
      user: userId,
      schedule: scheduleId,
      passenger,
      passengers,
      boardingPoint: selectedBoardingPoint,
      droppingPoint: selectedDroppingPoint,
      seats: normalizedSeats,
      seatPriceBreakdown,
      pricePerSeat,
      totalPrice,
      status: BOOKING_STATUS.PENDING,
      payment: {
        provider: "esewa",
        status: PAYMENT_STATUS.PENDING,
        productCode,
        totalAmount: totalPrice,
        transactionUuid: crypto.randomUUID(),
      },
    });
  } else {
    const normalizedState = await ensureBookingStateNormalized(booking);

    booking.passenger = passenger;
    booking.passengers = passengers;
    booking.boardingPoint = selectedBoardingPoint;
    booking.droppingPoint = selectedDroppingPoint;
    booking.seatPriceBreakdown = seatPriceBreakdown;
    booking.pricePerSeat = pricePerSeat;
    booking.totalPrice = totalPrice;
    booking.status = BOOKING_STATUS.PENDING;
    booking.payment = booking.payment || { provider: "esewa" };
    booking.payment.provider = "esewa";
    booking.payment.status = PAYMENT_STATUS.PENDING;
    booking.payment.productCode = productCode;
    booking.payment.totalAmount = totalPrice;
    booking.payment.paidAt = undefined;

    if (!booking.payment.transactionUuid || normalizedState.paymentStatus === PAYMENT_STATUS.FAILED) {
      booking.payment.transactionUuid = crypto.randomUUID();
    }

    await booking.save();
  }

  const fields = buildEsewaFormFields({ booking, productCode, secretKey });

  return {
    bookingId: booking._id,
    formUrl,
    fields,
    lockExpiresAt: lockResult?.expiresAt || null,
    lockDurationMs: lockResult?.lockDurationMs || seatLockService.getLockDurationMs(),
  };
};

const handleEsewaSuccess = async ({ query }) => {
  const frontendBaseUrl = getFrontendBaseUrl();
  try {
    const normalizedQuery = normalizeEsewaQuery(query);
    const decoded = extractEsewaCallback(normalizedQuery);
    const fallbackBookingId = String(normalizedQuery?.bookingId || "").trim();
    let transactionUuid = decoded?.transaction_uuid;
    let fallbackBooking = null;
    if (!transactionUuid && mongoose.isValidObjectId(fallbackBookingId)) {
      fallbackBooking = await Booking.findById(fallbackBookingId)
        .populate("user")
        .populate({ path: "schedule", populate: [{ path: "bus" }, { path: "route" }] });
      transactionUuid = fallbackBooking?.payment?.transactionUuid;
    }
    if (!transactionUuid && !fallbackBooking) {
      logEsewa("Callback missing transaction_uuid", { query: normalizedQuery });
      return `${frontendBaseUrl}/dashboard?payment=error`;
    }

    logEsewa("Callback received", {
      transaction_uuid: transactionUuid,
      status: decoded?.status,
      total_amount: decoded?.total_amount,
      product_code: decoded?.product_code,
    });

    const { statusUrlBase, productCode, secretKey } = getEsewaConfig();
    const trustedSuccess = isEsewaTrustedSuccess(decoded, secretKey);

    let booking = null;
    if (transactionUuid) {
      booking = await Booking.findOne({ "payment.transactionUuid": String(transactionUuid) })
        .populate("user")
        .populate({ path: "schedule", populate: [{ path: "bus" }, { path: "route" }] });
    }
    if (!booking && fallbackBooking) {
      booking = fallbackBooking;
    }

    if (!booking) {
      return `${frontendBaseUrl}/dashboard?payment=error`;
    }

    const normalizedState = await ensureBookingStateNormalized(booking);

    if (isScheduleUnavailable(booking?.schedule)) {
      await markBookingCancelled(booking, {
        gatewayStatus: "SCHEDULE_UNAVAILABLE",
        raw: { success: decoded },
      });
      return `${frontendBaseUrl}/dashboard?payment=failure&bookingId=${booking._id}`;
    }

    if (normalizedState.bookingStatus === BOOKING_STATUS.CANCELLED) {
      return `${frontendBaseUrl}/dashboard?payment=expired&bookingId=${booking._id}`;
    }

    if (normalizedState.bookingStatus === BOOKING_STATUS.CONFIRMED) {
      if (normalizedState.paymentStatus !== PAYMENT_STATUS.PAID) {
        booking.payment = booking.payment || { provider: "esewa" };
        booking.payment.status = PAYMENT_STATUS.PAID;
        booking.payment.paidAt = booking.payment.paidAt || new Date();
        await booking.save();
      }

      if (!booking.payment?.emailSentAt) {
        const ok = await sendTicketEmailSafely(booking);
        if (!ok) {
          // eslint-disable-next-line no-console
          console.warn("Ticket email not sent for booking", String(booking._id));
        }
      }
      return `${frontendBaseUrl}/dashboard?payment=success&bookingId=${booking._id}`;
    }

    const lockValidation = await validateBookingLocks(booking);
    if (!lockValidation.valid) {
      await markBookingCancelled(booking, {
        gatewayStatus: "LOCK_EXPIRED",
        raw: { success: decoded, lockValidation },
      });
      return `${frontendBaseUrl}/dashboard?payment=expired&bookingId=${booking._id}`;
    }

    const decodedTotalAmountRaw = decoded?.total_amount ?? decoded?.totalAmount;
    const statusTotalAmount = Number.isFinite(Number(decodedTotalAmountRaw))
      ? Number(decodedTotalAmountRaw)
      : (booking.payment?.totalAmount ?? booking.totalPrice);
    let status = null;
    let statusCheckError = null;
    try {
      status = await checkEsewaStatus({
        statusUrlBase,
        productCode: booking.payment?.productCode || productCode,
        totalAmount: statusTotalAmount,
        transactionUuid,
      });
    } catch (error) {
      statusCheckError = error;
    }

    const statusPayload = status && typeof status === "object"
      ? (status.data && typeof status.data === "object" ? status.data : status)
      : null;
    const statusValue = statusPayload?.status || statusPayload?.transaction_status || statusPayload?.status_code || status?.status;

    let gatewayStatus = trustedSuccess
      ? normalizeEsewaStatus(decoded?.status)
      : normalizeEsewaStatus(statusValue || decoded?.status);

    if (!trustedSuccess && isEsewaPendingStatus(gatewayStatus)) {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      try {
        status = await checkEsewaStatus({
          statusUrlBase,
          productCode: booking.payment?.productCode || productCode,
          totalAmount: statusTotalAmount,
          transactionUuid,
        });
        statusCheckError = null;
      } catch (error) {
        statusCheckError = error;
      }
      const retryPayload = status && typeof status === "object"
        ? (status.data && typeof status.data === "object" ? status.data : status)
        : null;
      const retryStatusValue = retryPayload?.status || retryPayload?.transaction_status || retryPayload?.status_code || status?.status;
      gatewayStatus = normalizeEsewaStatus(retryStatusValue || decoded?.status);
    }
    booking.payment = booking.payment || { provider: "esewa" };
    booking.payment.gatewayStatus = gatewayStatus;
    booking.payment.refId = statusPayload?.ref_id || status?.ref_id || booking.payment.refId;
    booking.payment.raw = {
      success: decoded,
      status: statusPayload || status,
      statusCheckError: statusCheckError ? String(statusCheckError?.message || statusCheckError) : undefined,
      trustedSuccess,
    };

    logEsewa("Status verification", {
      transaction_uuid: transactionUuid,
      gatewayStatus,
      statusPayload,
      statusCheckError: statusCheckError ? String(statusCheckError?.message || statusCheckError) : undefined,
      trustedSuccess,
    });

    if (trustedSuccess || isEsewaSuccessfulStatus(gatewayStatus)) {
      try {
        await seatLockService.confirmBooking({
          scheduleId: getBookingScheduleId(booking),
          seats: booking.seats,
          userId: booking.user?._id || booking.user,
          confirmFn: async () => {
            booking.status = BOOKING_STATUS.CONFIRMED;
            booking.payment.status = PAYMENT_STATUS.PAID;
            booking.payment.paidAt = booking.payment.paidAt || new Date();
            await booking.save();
            return booking;
          },
        });
      } catch (error) {
        if (seatLockService.isSeatLockError(error)) {
          await markBookingCancelled(booking, {
            gatewayStatus: "LOCK_EXPIRED",
            raw: { success: decoded, status, error: String(error?.message || "") },
          });
          return `${frontendBaseUrl}/dashboard?payment=expired&bookingId=${booking._id}`;
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

      return `${frontendBaseUrl}/dashboard?payment=success&bookingId=${booking._id}`;
    }

    if (!trustedSuccess && (!gatewayStatus || statusCheckError)) {
      booking.status = BOOKING_STATUS.PENDING;
      booking.payment.status = PAYMENT_STATUS.PENDING;
      await booking.save();
      return `${frontendBaseUrl}/dashboard?payment=pending&bookingId=${booking._id}`;
    }

    if (!trustedSuccess && isEsewaIndeterminateStatus(gatewayStatus)) {
      booking.status = BOOKING_STATUS.PENDING;
      booking.payment.status = PAYMENT_STATUS.PENDING;
      await booking.save();
      return `${frontendBaseUrl}/dashboard?payment=pending&bookingId=${booking._id}`;
    }

    if (isEsewaPendingStatus(gatewayStatus)) {
      booking.status = BOOKING_STATUS.PENDING;
      booking.payment.status = PAYMENT_STATUS.PENDING;
      await booking.save();
      return `${frontendBaseUrl}/dashboard?payment=pending&bookingId=${booking._id}`;
    }

    if (!trustedSuccess && isEsewaFailureStatus(gatewayStatus)) {
      await markBookingFailedForRetry(booking, {
        gatewayStatus: gatewayStatus || "FAILED",
        raw: { success: decoded, status, trustedSuccess },
      });
      return `${frontendBaseUrl}/dashboard?payment=failure&bookingId=${booking._id}`;
    }

    booking.status = BOOKING_STATUS.PENDING;
    booking.payment.status = PAYMENT_STATUS.PENDING;
    await booking.save();
    return `${frontendBaseUrl}/dashboard?payment=pending&bookingId=${booking._id}`;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    return `${frontendBaseUrl}/dashboard?payment=error`;
  }
};

const verifyEsewaPayment = async ({ userId, body }) => {
  const bookingId = String(body?.bookingId || "").trim();
  if (!mongoose.isValidObjectId(bookingId)) {
    throw new ApiError(400, "Valid bookingId is required", null);
  }

  const booking = await Booking.findOne({ _id: bookingId, user: userId })
    .populate("user")
    .populate({ path: "schedule", populate: [{ path: "bus" }, { path: "route" }] });

  if (!booking) {
    throw new ApiError(404, "Booking not found", null);
  }

  const normalizedState = await ensureBookingStateNormalized(booking);

  if (normalizedState.bookingStatus === BOOKING_STATUS.CONFIRMED && normalizedState.paymentStatus === PAYMENT_STATUS.PAID) {
    return {
      bookingId: String(booking._id),
      bookingStatus: BOOKING_STATUS.CONFIRMED,
      paymentStatus: PAYMENT_STATUS.PAID,
      gatewayStatus: booking?.payment?.gatewayStatus || null,
    };
  }

  if (normalizedState.bookingStatus === BOOKING_STATUS.CANCELLED) {
    return {
      bookingId: String(booking._id),
      bookingStatus: BOOKING_STATUS.CANCELLED,
      paymentStatus: PAYMENT_STATUS.FAILED,
      gatewayStatus: booking?.payment?.gatewayStatus || null,
    };
  }

  if (!booking?.payment?.transactionUuid) {
    throw new ApiError(400, "Payment transaction UUID missing", null);
  }

  if (isScheduleUnavailable(booking?.schedule)) {
    await markBookingCancelled(booking, { gatewayStatus: "SCHEDULE_UNAVAILABLE" });
    return {
      bookingId: String(booking._id),
      bookingStatus: BOOKING_STATUS.CANCELLED,
      paymentStatus: PAYMENT_STATUS.FAILED,
      gatewayStatus: "SCHEDULE_UNAVAILABLE",
    };
  }

  const lockValidation = await validateBookingLocks(booking, userId);
  if (!lockValidation.valid) {
    await markBookingCancelled(booking, {
      gatewayStatus: "LOCK_EXPIRED",
      raw: { verifyDenied: true, lockValidation },
    });
    return {
      bookingId: String(booking._id),
      bookingStatus: BOOKING_STATUS.CANCELLED,
      paymentStatus: PAYMENT_STATUS.FAILED,
      gatewayStatus: "LOCK_EXPIRED",
    };
  }

  const { statusUrlBase, productCode } = getEsewaConfig();
  let status = null;
  let statusCheckError = null;
  try {
    status = await checkEsewaStatus({
      statusUrlBase,
      productCode: booking.payment?.productCode || productCode,
      totalAmount: booking.payment?.totalAmount ?? booking.totalPrice,
      transactionUuid: booking.payment.transactionUuid,
    });
  } catch (error) {
    statusCheckError = error;
  }

  const statusPayload = status && typeof status === "object"
    ? (status.data && typeof status.data === "object" ? status.data : status)
    : null;
  const statusValue = statusPayload?.status || statusPayload?.transaction_status || statusPayload?.status_code || status?.status;
  const gatewayStatus = normalizeEsewaStatus(statusValue);

  booking.payment = booking.payment || { provider: "esewa" };
  booking.payment.gatewayStatus = gatewayStatus || booking.payment.gatewayStatus;
  booking.payment.refId = statusPayload?.ref_id || status?.ref_id || booking.payment.refId;
  booking.payment.raw = {
    ...(booking.payment.raw || {}),
    verify: {
      status: statusPayload || status || null,
      statusCheckError: statusCheckError ? String(statusCheckError?.message || statusCheckError) : undefined,
      checkedAt: new Date().toISOString(),
    },
  };

  if (statusCheckError || !gatewayStatus || isEsewaPendingStatus(gatewayStatus) || isEsewaIndeterminateStatus(gatewayStatus)) {
    booking.status = BOOKING_STATUS.PENDING;
    booking.payment.status = PAYMENT_STATUS.PENDING;
    await booking.save();
    return {
      bookingId: String(booking._id),
      bookingStatus: BOOKING_STATUS.PENDING,
      paymentStatus: PAYMENT_STATUS.PENDING,
      gatewayStatus: booking.payment.gatewayStatus || null,
    };
  }

  if (isEsewaSuccessfulStatus(gatewayStatus)) {
    try {
      await seatLockService.confirmBooking({
        scheduleId: getBookingScheduleId(booking),
        seats: booking.seats,
        userId: booking.user?._id || booking.user,
        confirmFn: async () => {
          booking.status = BOOKING_STATUS.CONFIRMED;
          booking.payment.status = PAYMENT_STATUS.PAID;
          booking.payment.paidAt = booking.payment.paidAt || new Date();
          await booking.save();
          return booking;
        },
      });
    } catch (error) {
      if (seatLockService.isSeatLockError(error)) {
        await markBookingCancelled(booking, {
          gatewayStatus: "LOCK_EXPIRED",
          raw: { verify: statusPayload || status, error: String(error?.message || "") },
        });
        return {
          bookingId: String(booking._id),
          bookingStatus: BOOKING_STATUS.CANCELLED,
          paymentStatus: PAYMENT_STATUS.FAILED,
          gatewayStatus: "LOCK_EXPIRED",
        };
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

    return {
      bookingId: String(booking._id),
      bookingStatus: BOOKING_STATUS.CONFIRMED,
      paymentStatus: PAYMENT_STATUS.PAID,
      gatewayStatus: booking.payment.gatewayStatus || null,
    };
  }

  if (isEsewaFailureStatus(gatewayStatus)) {
    await markBookingFailedForRetry(booking, {
      gatewayStatus: gatewayStatus || "FAILED",
      raw: { verify: statusPayload || status },
    });
    return {
      bookingId: String(booking._id),
      bookingStatus: BOOKING_STATUS.PENDING,
      paymentStatus: PAYMENT_STATUS.FAILED,
      gatewayStatus: booking.payment.gatewayStatus || gatewayStatus || null,
    };
  }

  booking.status = BOOKING_STATUS.PENDING;
  booking.payment.status = PAYMENT_STATUS.PENDING;
  await booking.save();
  return {
    bookingId: String(booking._id),
    bookingStatus: BOOKING_STATUS.PENDING,
    paymentStatus: PAYMENT_STATUS.PENDING,
    gatewayStatus: booking.payment.gatewayStatus || null,
  };
};

const handleEsewaFailure = async ({ query }) => {
  const frontendBaseUrl = getFrontendBaseUrl();
  try {
    const normalizedQuery = normalizeEsewaQuery(query);
    const decoded = extractEsewaCallback(normalizedQuery);
    const fallbackBookingId = String(normalizedQuery?.bookingId || "").trim();
    let transactionUuid = decoded?.transaction_uuid;
    let fallbackBooking = null;
    if (!transactionUuid && mongoose.isValidObjectId(fallbackBookingId)) {
      fallbackBooking = await Booking.findById(fallbackBookingId)
        .populate("user")
        .populate({ path: "schedule", populate: [{ path: "bus" }, { path: "route" }] });
      transactionUuid = fallbackBooking?.payment?.transactionUuid;
    }
    if (!transactionUuid && !fallbackBooking) {
      logEsewa("Failure callback missing transaction_uuid", { query: normalizedQuery });
      return `${frontendBaseUrl}/dashboard?payment=failure`;
    }

    logEsewa("Failure callback received", {
      transaction_uuid: transactionUuid,
      status: decoded?.status,
      total_amount: decoded?.total_amount,
      product_code: decoded?.product_code,
    });

    const { statusUrlBase, productCode, secretKey } = getEsewaConfig();
    const trustedSuccess = isEsewaTrustedSuccess(decoded, secretKey);

    let booking = null;
    if (transactionUuid) {
      booking = await Booking.findOne({ "payment.transactionUuid": String(transactionUuid) })
        .populate("user")
        .populate({ path: "schedule", populate: [{ path: "bus" }, { path: "route" }] });
    }
    if (!booking && fallbackBooking) {
      booking = fallbackBooking;
    }
    if (booking) {
      const normalizedState = await ensureBookingStateNormalized(booking);
      if (normalizedState.bookingStatus === BOOKING_STATUS.CANCELLED) {
        return `${frontendBaseUrl}/dashboard?payment=expired&bookingId=${booking._id}`;
      }

      if (normalizedState.bookingStatus === BOOKING_STATUS.CONFIRMED) {
        if (normalizedState.paymentStatus !== PAYMENT_STATUS.PAID) {
          booking.payment = booking.payment || { provider: "esewa" };
          booking.payment.status = PAYMENT_STATUS.PAID;
          booking.payment.paidAt = booking.payment.paidAt || new Date();
          await booking.save();
        }
        return `${frontendBaseUrl}/dashboard?payment=success&bookingId=${booking._id}`;
      }

      if (isScheduleUnavailable(booking?.schedule)) {
        await markBookingCancelled(booking, {
          gatewayStatus: "SCHEDULE_UNAVAILABLE",
          raw: { failure: decoded },
        });
        return `${frontendBaseUrl}/dashboard?payment=failure&bookingId=${booking._id}`;
      }

      const lockValidation = await validateBookingLocks(booking);
      if (!lockValidation.valid) {
        await markBookingCancelled(booking, {
          gatewayStatus: "LOCK_EXPIRED",
          raw: { failure: decoded, lockValidation },
        });
        return `${frontendBaseUrl}/dashboard?payment=expired&bookingId=${booking._id}`;
      }

      const decodedTotalAmountRaw = decoded?.total_amount ?? decoded?.totalAmount;
      const statusTotalAmount = Number.isFinite(Number(decodedTotalAmountRaw))
        ? Number(decodedTotalAmountRaw)
        : (booking.payment?.totalAmount ?? booking.totalPrice);
      let status = null;
      let statusCheckError = null;
      try {
        status = await checkEsewaStatus({
          statusUrlBase,
          productCode: booking.payment?.productCode || productCode,
          totalAmount: statusTotalAmount,
          transactionUuid,
        });
      } catch (error) {
        statusCheckError = error;
      }

      const statusPayload = status && typeof status === "object"
        ? (status.data && typeof status.data === "object" ? status.data : status)
        : null;
      const statusValue = statusPayload?.status || statusPayload?.transaction_status || statusPayload?.status_code || status?.status;
      const gatewayStatus = trustedSuccess
        ? normalizeEsewaStatus(decoded?.status)
        : normalizeEsewaStatus(statusValue || decoded?.status);

      booking.payment = booking.payment || { provider: "esewa" };
      booking.payment.gatewayStatus = gatewayStatus;
      booking.payment.refId = statusPayload?.ref_id || status?.ref_id || booking.payment.refId;
      booking.payment.raw = {
        failure: decoded,
        status: statusPayload || status,
        statusCheckError: statusCheckError ? String(statusCheckError?.message || statusCheckError) : undefined,
        trustedSuccess,
      };

      logEsewa("Failure status verification", {
        transaction_uuid: transactionUuid,
        gatewayStatus,
        statusPayload,
        statusCheckError: statusCheckError ? String(statusCheckError?.message || statusCheckError) : undefined,
        trustedSuccess,
      });

      if (trustedSuccess || isEsewaSuccessfulStatus(gatewayStatus)) {
        try {
          await seatLockService.confirmBooking({
            scheduleId: getBookingScheduleId(booking),
            seats: booking.seats,
            userId: booking.user?._id || booking.user,
            confirmFn: async () => {
              booking.status = BOOKING_STATUS.CONFIRMED;
              booking.payment.status = PAYMENT_STATUS.PAID;
              booking.payment.paidAt = booking.payment.paidAt || new Date();
              await booking.save();
              return booking;
            },
          });
        } catch (error) {
          if (seatLockService.isSeatLockError(error)) {
            await markBookingCancelled(booking, {
              gatewayStatus: "LOCK_EXPIRED",
              raw: { failure: decoded, status, error: String(error?.message || "") },
            });
            return `${frontendBaseUrl}/dashboard?payment=expired&bookingId=${booking._id}`;
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

        return `${frontendBaseUrl}/dashboard?payment=success&bookingId=${booking._id}`;
      }

      if (!trustedSuccess && (!gatewayStatus || statusCheckError)) {
        booking.status = BOOKING_STATUS.PENDING;
        booking.payment.status = PAYMENT_STATUS.PENDING;
        await booking.save();
        return `${frontendBaseUrl}/dashboard?payment=pending&bookingId=${booking._id}`;
      }

      if (!trustedSuccess && isEsewaIndeterminateStatus(gatewayStatus)) {
        booking.status = BOOKING_STATUS.PENDING;
        booking.payment.status = PAYMENT_STATUS.PENDING;
        await booking.save();
        return `${frontendBaseUrl}/dashboard?payment=pending&bookingId=${booking._id}`;
      }

      if (isEsewaPendingStatus(gatewayStatus)) {
        booking.status = BOOKING_STATUS.PENDING;
        booking.payment.status = PAYMENT_STATUS.PENDING;
        await booking.save();
        return `${frontendBaseUrl}/dashboard?payment=pending&bookingId=${booking._id}`;
      }

      if (!trustedSuccess && isEsewaFailureStatus(gatewayStatus)) {
        await markBookingFailedForRetry(booking, {
          gatewayStatus: gatewayStatus || "FAILED",
          raw: { failure: decoded, status: statusPayload || status, trustedSuccess },
        });
        return `${frontendBaseUrl}/dashboard?payment=failure&bookingId=${booking._id}`;
      }

      booking.status = BOOKING_STATUS.PENDING;
      booking.payment.status = PAYMENT_STATUS.PENDING;
      await booking.save();
      return `${frontendBaseUrl}/dashboard?payment=pending&bookingId=${booking._id}`;
    }

    return `${frontendBaseUrl}/dashboard?payment=failure`;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    return `${frontendBaseUrl}/dashboard?payment=error`;
  }
};

const debugEsewaPayment = async ({ user, params, query }) => {
  if (!shouldLogEsewa()) {
    throw new ApiError(403, "ESEWA_DEBUG is disabled", null);
  }

  const bookingId = String(params?.bookingId || "").trim();
  if (!mongoose.isValidObjectId(bookingId)) {
    throw new ApiError(400, "Valid bookingId is required", null);
  }

  const booking = await Booking.findById(bookingId)
    .populate("user")
    .populate({ path: "schedule", populate: [{ path: "bus" }, { path: "route" }] });

  if (!booking) {
    throw new ApiError(404, "Booking not found", null);
  }

  if (String(booking.user?._id || booking.user) !== String(user?.id) && user?.role !== "admin") {
    throw new ApiError(403, "Forbidden", null);
  }

  const { productCode, secretKey, formUrl, statusUrlBase } = getEsewaConfig();
  let fields = null;
  let fieldsError = null;
  try {
    fields = buildEsewaFormFields({ booking, productCode, secretKey });
  } catch (error) {
    fieldsError = String(error?.message || error);
  }

  let statusCheck = null;
  let statusError = null;
  const checkStatus = String(query?.checkStatus || "").trim().toLowerCase() === "true";
  if (checkStatus && booking?.payment?.transactionUuid) {
    try {
      statusCheck = await checkEsewaStatus({
        statusUrlBase,
        productCode: booking.payment?.productCode || productCode,
        totalAmount: booking.payment?.totalAmount ?? booking.totalPrice,
        transactionUuid: booking.payment?.transactionUuid,
      });
    } catch (error) {
      statusError = String(error?.message || error);
    }
  }

  return {
    config: {
      productCode,
      formUrl,
      statusUrlBase,
      publicBaseUrl: getPublicBaseUrl(),
      frontendBaseUrl: getFrontendBaseUrl(),
    },
    booking: {
      id: String(booking?._id || ""),
      status: booking?.status,
      seats: booking?.seats,
      totalPrice: booking?.totalPrice,
      payment: booking?.payment,
    },
    fields,
    fieldsError,
    statusCheck,
    statusError,
  };
};

const retryEsewaPayment = async ({ userId, body }) => {
  const bookingId = String(body?.bookingId || "").trim();
  if (!mongoose.isValidObjectId(bookingId)) {
    throw new ApiError(400, "Valid bookingId is required", null);
  }

  const booking = await Booking.findOne({ _id: bookingId, user: userId })
    .populate({ path: "schedule", populate: [{ path: "bus" }, { path: "route" }] });

  if (!booking) {
    throw new ApiError(404, "Booking not found", null);
  }

  const normalizedState = await ensureBookingStateNormalized(booking);

  if (normalizedState.bookingStatus === BOOKING_STATUS.CONFIRMED && normalizedState.paymentStatus === PAYMENT_STATUS.PAID) {
    throw new ApiError(409, "Booking is already paid", null);
  }

  if (normalizedState.bookingStatus === BOOKING_STATUS.CANCELLED) {
    throw new ApiError(409, "Booking is already cancelled", null);
  }

  if (!isRetryablePendingBooking(normalizedState)) {
    throw new ApiError(409, "Only pending bookings can be retried", null);
  }

  if (isScheduleUnavailable(booking?.schedule)) {
    await markBookingCancelled(booking, { gatewayStatus: "SCHEDULE_UNAVAILABLE" });
    return {
      message: "Schedule is no longer available",
      bookingStatus: BOOKING_STATUS.CANCELLED,
      paymentStatus: PAYMENT_STATUS.FAILED,
    };
  }

  const lockValidation = await validateBookingLocks(booking, userId);
  if (!lockValidation.valid) {
    await markBookingCancelled(booking, {
      gatewayStatus: "LOCK_EXPIRED",
      raw: { retryDenied: true, lockValidation },
    });

    return {
      message: "Seat lock expired. Please reselect seats to retry payment.",
      bookingStatus: BOOKING_STATUS.CANCELLED,
      paymentStatus: PAYMENT_STATUS.FAILED,
      failedSeats: [...lockValidation.missingLocks, ...lockValidation.conflictSeats],
    };
  }

  const lockResult = await seatLockService.lockSeats({
    scheduleId: getBookingScheduleId(booking),
    seats: booking.seats,
    userId,
    sessionId: body?.sessionId,
  });

  const { productCode, secretKey, formUrl } = getEsewaConfig();
  const totalAmount = Number(booking.payment?.totalAmount ?? booking.totalPrice);
  if (!Number.isFinite(totalAmount) || totalAmount <= 0) {
    throw new ApiError(400, "Invalid booking amount for retry", null);
  }

  const priorRetryCount = Number(booking.payment?.raw?.retryCount || 0);

  booking.status = BOOKING_STATUS.PENDING;
  booking.payment = booking.payment || { provider: "esewa" };
  booking.payment.provider = "esewa";
  booking.payment.status = PAYMENT_STATUS.PENDING;
  booking.payment.productCode = productCode;
  booking.payment.totalAmount = totalAmount;
  booking.payment.transactionUuid = crypto.randomUUID();
  booking.payment.refId = undefined;
  booking.payment.paidAt = undefined;
  booking.payment.gatewayStatus = "RETRY_INITIATED";
  booking.payment.raw = {
    retryCount: priorRetryCount + 1,
    retryInitiatedAt: new Date().toISOString(),
  };

  await booking.save();

  const fields = buildEsewaFormFields({ booking, productCode, secretKey });

  return {
    bookingId: booking._id,
    formUrl,
    fields,
    lockExpiresAt: lockResult?.expiresAt || null,
    lockDurationMs: lockResult?.lockDurationMs || seatLockService.getLockDurationMs(),
  };
};

module.exports = {
  initiateEsewaPayment,
  verifyEsewaPayment,
  handleEsewaSuccess,
  handleEsewaFailure,
  debugEsewaPayment,
  retryEsewaPayment,
  __private__: {
    decodeEsewaData,
    normalizeEsewaStatus,
    isEsewaSuccessfulStatus,
    isEsewaCallbackSignatureValid,
    isEsewaTrustedSuccess,
  },
};
