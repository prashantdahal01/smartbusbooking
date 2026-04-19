const BOOKING_STATUS = Object.freeze({
  PENDING: "pending",
  CONFIRMED: "confirmed",
  CANCELLED: "cancelled",
});

const PAYMENT_STATUS = Object.freeze({
  PENDING: "pending",
  PAID: "paid",
  FAILED: "failed",
});

const normalizePaymentStatus = (value) => {
  const normalized = String(value || "").trim().toLowerCase();

  if (normalized === PAYMENT_STATUS.PAID) return PAYMENT_STATUS.PAID;
  if (normalized === PAYMENT_STATUS.FAILED) return PAYMENT_STATUS.FAILED;

  // Treat legacy "initiated" and any unknown status as pending for retry flow.
  return PAYMENT_STATUS.PENDING;
};

const normalizeBookingStatus = (status, normalizedPaymentStatus) => {
  const normalized = String(status || "").trim().toLowerCase();

  if (normalized === BOOKING_STATUS.CANCELLED) return BOOKING_STATUS.CANCELLED;
  if (normalized === BOOKING_STATUS.CONFIRMED) return BOOKING_STATUS.CONFIRMED;

  if (normalized === BOOKING_STATUS.PENDING) return BOOKING_STATUS.PENDING;
  if (normalized === "payment_pending") return BOOKING_STATUS.PENDING;
  if (normalized === "payment_failed") return BOOKING_STATUS.PENDING;

  if (normalizedPaymentStatus === PAYMENT_STATUS.PAID) return BOOKING_STATUS.CONFIRMED;
  return BOOKING_STATUS.PENDING;
};

const normalizeBookingDocument = (booking) => {
  if (!booking || typeof booking !== "object") {
    return {
      changed: false,
      bookingStatus: BOOKING_STATUS.PENDING,
      paymentStatus: PAYMENT_STATUS.PENDING,
    };
  }

  if (!booking.payment || typeof booking.payment !== "object") {
    booking.payment = { provider: "esewa" };
  }

  let changed = false;

  if (!booking.payment.provider) {
    booking.payment.provider = "esewa";
    changed = true;
  }

  let paymentStatus = normalizePaymentStatus(booking.payment.status);
  const bookingStatus = normalizeBookingStatus(booking.status, paymentStatus);

  if (bookingStatus === BOOKING_STATUS.CONFIRMED && paymentStatus !== PAYMENT_STATUS.PAID) {
    paymentStatus = PAYMENT_STATUS.PAID;
  }

  if (booking.payment.status !== paymentStatus) {
    booking.payment.status = paymentStatus;
    changed = true;
  }

  if (booking.status !== bookingStatus) {
    booking.status = bookingStatus;
    changed = true;
  }

  return {
    changed,
    bookingStatus,
    paymentStatus,
  };
};

const isPendingBooking = ({ bookingStatus, paymentStatus }) => {
  return bookingStatus === BOOKING_STATUS.PENDING && paymentStatus !== PAYMENT_STATUS.PAID;
};

const isRetryablePendingBooking = ({ bookingStatus, paymentStatus }) => {
  return (
    bookingStatus === BOOKING_STATUS.PENDING
    && (paymentStatus === PAYMENT_STATUS.PENDING || paymentStatus === PAYMENT_STATUS.FAILED)
  );
};

module.exports = {
  BOOKING_STATUS,
  PAYMENT_STATUS,
  normalizePaymentStatus,
  normalizeBookingStatus,
  normalizeBookingDocument,
  isPendingBooking,
  isRetryablePendingBooking,
};
