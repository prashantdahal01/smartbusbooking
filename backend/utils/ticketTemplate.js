const QRCode = require("qrcode");

const safeString = (value) => String(value == null ? "" : value);

const safeText = (value, fallback = "N/A") => {
  const text = safeString(value).trim();
  return text || fallback;
};

const escapeHtml = (value) =>
  safeString(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const normalizeSeatLabel = (value) => safeString(value).trim().toUpperCase().replace(/\s+/g, "");

const formatDateLabel = (rawDate) => {
  const text = safeString(rawDate).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return safeText(text, "Date N/A");

  const parsed = new Date(`${text}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return safeText(text, "Date N/A");

  return parsed.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
};

const formatTimeLabel = (value) => {
  const text = safeString(value).trim();
  if (!text) return "Time N/A";
  if (!/^\d{2}:\d{2}$/.test(text)) return text;

  const [hoursText, minutesText] = text.split(":");
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return text;

  const parsed = new Date();
  parsed.setHours(hours, minutes, 0, 0);
  return parsed.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
};

const formatBookingReference = (value) => {
  const text = safeString(value).trim().replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  if (!text) return "N/A";
  return `#SB-${text.slice(-8)}`;
};

const formatPassengerLabel = (passenger, index) => {
  const name = safeText(passenger?.name, `Passenger ${index + 1}`);
  const seat = normalizeSeatLabel(passenger?.seatLabel);
  return seat ? `${name} (${seat})` : name;
};

const getTicketQrPayload = (view) => {
  return JSON.stringify({
    bookingId: view.bookingId,
    reference: view.bookingReference,
    route: view.routeLabel,
    travelDate: view.travelDate,
    seats: view.seatNumbers,
    totalAmount: view.totalAmountValue,
  });
};

const formatTokenLabel = (value) =>
  safeString(value)
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

const formatCurrency = (value) => {
  const amount = Number(value);
  const safeAmount = Number.isFinite(amount) ? amount : 0;
  return `NPR ${safeAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
};

const getSeatTypeLabel = (booking) => {
  const fromBreakdown = Array.isArray(booking?.seatPriceBreakdown)
    ? booking.seatPriceBreakdown.map((entry) => formatTokenLabel(entry?.seatType)).filter(Boolean)
    : [];

  if (fromBreakdown.length > 0) {
    return [...new Set(fromBreakdown)].join(", ");
  }

  const fromBusTypes = Array.isArray(booking?.schedule?.bus?.busTypes)
    ? booking.schedule.bus.busTypes.map((type) => formatTokenLabel(type)).filter(Boolean)
    : [];

  if (fromBusTypes.length > 0) {
    return [...new Set(fromBusTypes)].join(", ");
  }

  return safeText(booking?.schedule?.bus?.type, "Seater");
};

const getBusTypeLabel = (booking) => {
  const busTypes = Array.isArray(booking?.schedule?.bus?.busTypes) ? booking.schedule.bus.busTypes : [];
  if (busTypes.length > 0) {
    return busTypes.map((type) => formatTokenLabel(type)).join(", ");
  }
  return safeText(booking?.schedule?.bus?.type, "AC / Seater");
};

const getPricePerSeat = (booking, seatCount) => {
  const explicit = Number(booking?.pricePerSeat);
  if (Number.isFinite(explicit) && explicit >= 0) return explicit;

  const schedulePrice = Number(booking?.schedule?.price);
  if (Number.isFinite(schedulePrice) && schedulePrice >= 0) return schedulePrice;

  const total = Number(booking?.totalPrice);
  if (Number.isFinite(total) && total >= 0 && seatCount > 0) {
    return Number((total / seatCount).toFixed(2));
  }

  return 0;
};

const formatPassengerAge = (value) => {
  const age = Number(value);
  if (!Number.isFinite(age) || age < 1 || age > 120) return "N/A";
  return String(Math.trunc(age));
};

const buildPassengerList = (booking, seats = []) => {
  const seatLabels = (Array.isArray(seats) ? seats : []).map((seat) => normalizeSeatLabel(seat)).filter(Boolean);
  const rawPassengers = Array.isArray(booking?.passengers) ? booking.passengers : [];
  const fallbackPassenger = booking?.passenger || null;

  const passengers = rawPassengers
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null;
      const seatLabel = normalizeSeatLabel(entry?.seatLabel || seatLabels[index] || "");
      const idNumber = safeString(entry?.idNumber).trim();

      return {
        name: safeText(entry?.name, `Passenger ${index + 1}`),
        phone: safeText(entry?.phone),
        gender: safeText(formatTokenLabel(entry?.gender), "N/A"),
        age: formatPassengerAge(entry?.age),
        seatLabel: seatLabel || "N/A",
        idNumber: idNumber || "N/A",
      };
    })
    .filter(Boolean);

  if (passengers.length === 0 && fallbackPassenger) {
    passengers.push({
      name: safeText(fallbackPassenger?.name, "Passenger 1"),
      phone: safeText(fallbackPassenger?.phone),
      gender: safeText(formatTokenLabel(fallbackPassenger?.gender), "N/A"),
      age: formatPassengerAge(fallbackPassenger?.age),
      seatLabel: seatLabels[0] || "N/A",
      idNumber: "N/A",
    });
  }

  const assignedSeats = new Set();
  passengers.forEach((item) => {
    const seatLabel = normalizeSeatLabel(item?.seatLabel);
    if (!seatLabel || seatLabel === "N/A") return;
    assignedSeats.add(seatLabel);
  });

  const unassignedSeats = seatLabels.filter((seatLabel) => !assignedSeats.has(seatLabel));
  passengers.forEach((item) => {
    if (normalizeSeatLabel(item?.seatLabel)) return;
    const nextSeat = unassignedSeats.shift();
    if (nextSeat) item.seatLabel = nextSeat;
  });

  unassignedSeats.forEach((seatLabel, index) => {
    passengers.push({
      name: `Passenger ${passengers.length + index + 1}`,
      phone: "N/A",
      gender: "N/A",
      age: "N/A",
      seatLabel,
      idNumber: "N/A",
    });
  });

  if (passengers.length === 0) {
    passengers.push({
      name: "Passenger 1",
      phone: "N/A",
      gender: "N/A",
      age: "N/A",
      seatLabel: seatLabels[0] || "N/A",
      idNumber: "N/A",
    });
  }

  return passengers;
};

const buildTicketViewModel = (booking) => {
  const route = booking?.schedule?.route || {};
  const bus = booking?.schedule?.bus || {};

  const seats = Array.isArray(booking?.seats) ? booking.seats : [];
  const seatCount = Math.max(seats.length, 1);
  const passengers = buildPassengerList(booking, seats);
  const pricePerSeat = getPricePerSeat(booking, seatCount);

  const totalValue = Number(booking?.totalPrice);
  const totalAmount = Number.isFinite(totalValue) && totalValue >= 0 ? totalValue : pricePerSeat * seatCount;
  const baseFareAmount = Array.isArray(booking?.seatPriceBreakdown) && booking.seatPriceBreakdown.length > 0
    ? booking.seatPriceBreakdown.reduce((sum, item) => sum + Number(item?.price || 0), 0)
    : pricePerSeat * seatCount;
  const bookingFeeAmount = Math.max(0, Number((totalAmount - baseFareAmount).toFixed(2)));
  const paymentProvider = safeString(booking?.payment?.provider).trim().toLowerCase() === "esewa" ? "eSewa" : safeText(booking?.payment?.provider, "Online Payment");
  const paymentStatus = safeText(formatTokenLabel(booking?.payment?.status), "Paid");
  const bookingReference = formatBookingReference(booking?._id);
  const routeLabel = `${safeText(route?.source)} → ${safeText(route?.destination)}`;
  const boardingTime = formatTimeLabel(booking?.boardingPoint?.time || booking?.schedule?.time);
  const departureTime = formatTimeLabel(booking?.schedule?.time || booking?.boardingPoint?.time);
  const arrivalTime = formatTimeLabel(booking?.droppingPoint?.time || booking?.schedule?.arrivalTime);
  const boardingOrder = Number(booking?.boardingPoint?.order);
  const platformLabel = Number.isFinite(boardingOrder) && boardingOrder > 0 ? String(Math.trunc(boardingOrder)) : "N/A";
  const passengerSummary = passengers.map((passenger, index) => formatPassengerLabel(passenger, index)).join(", ");
  const confirmedAt = booking?.payment?.paidAt || booking?.updatedAt || booking?.createdAt || null;

  return {
    companyName: "SmartBus Express",
    companyTag: "Digital Ticket",
    greetingName: safeText(booking?.passenger?.name, passengers[0]?.name || "Passenger"),
    bookingId: safeText(booking?._id),
    bookingReference,
    statusText: safeText(booking?.status, "confirmed").replace(/_/g, " "),
    isConfirmed: safeString(booking?.status).toLowerCase() === "confirmed",
    paymentStatus,
    paymentProvider,
    paymentReference: safeText(booking?.payment?.refId || booking?.payment?.transactionUuid || booking?._id),

    from: safeText(route?.source),
    to: safeText(route?.destination),
    routeLabel,
    travelDate: formatDateLabel(booking?.schedule?.date),
    departureTime,
    arrivalTime,
    boardingTime,
    confirmedAt: confirmedAt ? new Date(confirmedAt).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }) : "N/A",

    passengers,
    totalPassengers: passengers.length,
    passengerSummary,

    seatNumbers: seats.length > 0 ? seats.join(", ") : "N/A",
    seatType: getSeatTypeLabel(booking),
    boardingPoint: safeText(booking?.boardingPoint?.name),
    droppingPoint: safeText(booking?.droppingPoint?.name),
    platformLabel,

    busName: safeText(bus?.name),
    busType: getBusTypeLabel(booking),
    vehicleNumber: safeText(bus?.vehicleNumber),
    busPhone: safeText(bus?.phone || bus?.contactNumber || bus?.mobileNumber, "N/A"),

    pricePerSeat: formatCurrency(pricePerSeat),
    baseFare: formatCurrency(baseFareAmount),
    bookingFee: formatCurrency(bookingFeeAmount),
    seatCount,
    totalAmount: formatCurrency(totalAmount),
    totalAmountValue: totalAmount,
  };
};

const buildPassengerRowsHtml = (passengers = []) => {
  return passengers
    .map((passenger, index) => {
      return `
        <div class="passenger-row">
          <div class="passenger-head">
            <span class="passenger-index">Passenger ${index + 1}</span>
            <span class="passenger-seat">Seat: ${escapeHtml(passenger?.seatLabel)}</span>
          </div>
          <div class="passenger-meta">
            <span><span class="meta-label">Name:</span> ${escapeHtml(passenger?.name)}</span>
            <span><span class="meta-label">Phone:</span> ${escapeHtml(passenger?.phone)}</span>
            <span><span class="meta-label">Gender:</span> ${escapeHtml(passenger?.gender)}</span>
            <span><span class="meta-label">Age:</span> ${escapeHtml(passenger?.age)}</span>
            <span><span class="meta-label">ID:</span> ${escapeHtml(passenger?.idNumber)}</span>
          </div>
        </div>
      `;
    })
    .join("");
};

const getLayoutScale = (passengerCount) => {
  const count = Number(passengerCount) || 1;
  if (count >= 10) return 0.82;
  if (count >= 8) return 0.86;
  if (count >= 6) return 0.9;
  if (count >= 5) return 0.94;
  return 1;
};

const buildTicketHtml = async (booking) => {
  const view = buildTicketViewModel(booking);
  const layoutScale = getLayoutScale(view.totalPassengers);
  const qrPayload = getTicketQrPayload(view);

  let qrDataUrl = "";
  try {
    qrDataUrl = await QRCode.toDataURL(qrPayload, {
      width: 220,
      margin: 1,
      color: {
        dark: "#0f3b82",
        light: "#ffffff",
      },
    });
  } catch {
    qrDataUrl = "";
  }

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ticket ${escapeHtml(view.bookingId)}</title>
    <style>
      @page {
        size: A4 landscape;
        margin: 5mm;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
        color: #0f172a;
      }

      .pdf-page {
        width: 100%;
        min-height: 100vh;
        margin: 0 auto;
        background: linear-gradient(180deg, #eff4fb 0%, #f8fafc 100%);
        padding: 0;
      }

      .ticket-scale {
        width: calc(100% / var(--ticket-scale, 1));
        transform: scale(var(--ticket-scale, 1));
        transform-origin: top center;
        padding: 0 2mm 2mm;
      }

      .ticket-card {
        width: 100%;
        border-radius: 18px;
        border: 1px solid #cbd5e1;
        background: #ffffff;
        padding: 0;
        overflow: hidden;
        box-shadow: 0 10px 30px rgba(15, 23, 42, 0.12);
      }

      .ticket-card,
      .ticket-grid,
      .ticket-box,
      .ticket-table,
      .payment-row,
      .instruction-item,
      .ticket-footer {
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .ticket-header {
        background: linear-gradient(90deg, #0b2a59 0%, #0f3b82 58%, #0b2a59 100%);
        color: #ffffff;
        padding: 14px 20px 10px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 16px;
        border-bottom: 4px solid #cbd5e1;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .brand-mark {
        width: 42px;
        height: 42px;
        border-radius: 12px;
        background: rgba(255, 255, 255, 0.16);
        display: grid;
        place-items: center;
        border: 1px solid rgba(255, 255, 255, 0.18);
        flex: 0 0 auto;
      }

      .brand-name {
        margin: 0;
        font-size: 22px;
        font-weight: 800;
        line-height: 1;
        letter-spacing: -0.03em;
      }

      .brand-tag {
        margin-top: 2px;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 0.22em;
        color: rgba(255, 255, 255, 0.82);
        font-weight: 700;
      }

      .status-chip {
        border-radius: 999px;
        padding: 8px 14px;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        font-weight: 800;
        color: #ffffff;
        background: #0d9488;
        box-shadow: 0 10px 24px rgba(13, 148, 136, 0.25);
      }

      .ticket-body {
        padding: 16px 18px 14px;
      }

      .greeting {
        margin: 0 0 8px;
        font-size: 18px;
        line-height: 1.35;
        color: #111827;
      }

      .greeting strong {
        color: #0f3b82;
      }

      .subcopy {
        margin: 0 0 14px;
        font-size: 13px;
        line-height: 1.45;
        color: #334155;
      }

      .ticket-grid {
        display: grid;
        grid-template-columns: 1.55fr 1fr 0.8fr;
        gap: 14px;
      }

      .ticket-grid-bottom {
        margin-top: 14px;
        display: grid;
        grid-template-columns: 1fr 1.15fr;
        gap: 14px;
      }

      .ticket-box {
        border: 1px solid #d7e0ec;
        border-radius: 14px;
        background: #ffffff;
        overflow: hidden;
      }

      .ticket-box-header {
        background: linear-gradient(90deg, #0f3b82 0%, #0b2a59 100%);
        color: #ffffff;
        padding: 9px 12px;
        font-size: 12px;
        font-weight: 800;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      .ticket-box-body {
        padding: 12px;
      }

      .summary-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }

      .summary-table tr + tr td {
        border-top: 1px solid #e5e7eb;
      }

      .summary-table td {
        padding: 8px 0;
        vertical-align: top;
      }

      .summary-label {
        width: 34%;
        color: #475569;
        font-weight: 700;
      }

      .summary-value {
        color: #0f172a;
        font-weight: 700;
      }

      .passenger-strip {
        margin-top: 10px;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .passenger-pill {
        border: 1px solid #cfd9e6;
        background: #f8fbff;
        border-radius: 999px;
        padding: 5px 9px;
        font-size: 11px;
        color: #0f172a;
        font-weight: 700;
      }

      .detail-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        padding: 8px 0;
        border-bottom: 1px solid #e5e7eb;
        font-size: 12px;
      }

      .detail-row:last-child {
        border-bottom: 0;
        padding-bottom: 0;
      }

      .detail-row strong {
        color: #0f172a;
      }

      .detail-label {
        color: #475569;
        font-weight: 700;
      }

      .detail-value {
        color: #111827;
        text-align: right;
        font-weight: 700;
      }

      .departure-hero {
        margin-top: 2px;
        padding: 10px 12px;
        border-radius: 12px;
        border: 1px solid #c7d2fe;
        background: linear-gradient(180deg, #f8faff 0%, #eef4ff 100%);
      }

      .departure-hero .label {
        display: block;
        font-size: 11px;
        color: #475569;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .departure-hero .value {
        display: block;
        margin-top: 4px;
        font-size: 17px;
        font-weight: 900;
        color: #0f3b82;
      }

      .departure-note {
        margin-top: 6px;
        font-size: 12px;
        color: #b45309;
        font-weight: 700;
      }

      .qr-card {
        border: 1px dashed #94a3b8;
        border-radius: 14px;
        background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
        padding: 12px;
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        text-align: center;
      }

      .qr-chip {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 120px;
        padding: 8px 12px;
        border-radius: 10px;
        background: #0f3b82;
        color: #ffffff;
        font-size: 12px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .qr-image {
        margin-top: 10px;
        width: 132px;
        height: 132px;
        border-radius: 10px;
        border: 1px solid #e2e8f0;
        background: #ffffff;
        object-fit: contain;
      }

      .qr-image.empty {
        display: grid;
        place-items: center;
        color: #94a3b8;
        font-size: 12px;
        font-weight: 700;
      }

      .qr-caption {
        margin: 10px 0 0;
        font-size: 12px;
        line-height: 1.4;
        color: #334155;
      }

      .qr-booking {
        margin-top: 8px;
        font-size: 11px;
        color: #64748b;
        font-weight: 700;
      }

      .payment-grid {
        display: grid;
        gap: 8px;
      }

      .payment-row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 12px;
        padding-bottom: 8px;
        border-bottom: 1px dashed #d6deea;
      }

      .payment-row:last-child {
        padding-bottom: 0;
        border-bottom: 0;
      }

      .payment-row .label {
        color: #475569;
        font-weight: 700;
      }

      .payment-row .value {
        color: #0f172a;
        font-weight: 800;
      }

      .payment-total {
        margin-top: 4px;
        padding-top: 10px;
        border-top: 1px solid #cbd5e1;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        font-size: 14px;
        font-weight: 900;
        color: #0f3b82;
      }

      .instructions-list {
        display: grid;
        gap: 8px;
      }

      .instruction-item {
        display: grid;
        grid-template-columns: 24px 1fr;
        gap: 8px;
        align-items: start;
        font-size: 12px;
        line-height: 1.45;
        color: #334155;
      }

      .instruction-icon {
        width: 22px;
        height: 22px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: #eef2ff;
        color: #0f3b82;
        font-weight: 900;
        font-size: 11px;
      }

      .ticket-footer {
        margin-top: 14px;
        border-top: 1px solid #dbe4f0;
        padding: 10px 18px 14px;
        display: flex;
        justify-content: space-between;
        gap: 12px;
        font-size: 12px;
        color: #475569;
        align-items: flex-start;
      }

      .footer-block {
        display: flex;
        gap: 8px;
        gap: 14px;
      }

      .footer-badge {
        width: 28px;
        height: 28px;
        border-radius: 999px;
        display: grid;
        place-items: center;
        background: #eef2ff;
        color: #0f3b82;
        font-weight: 900;
      }

      .footer-title {
        margin: 0 0 2px;
        font-size: 13px;
        font-weight: 900;
        color: #0f172a;
      }

      .footer-small {
        margin: 0;
        font-size: 11px;
        color: #64748b;
        line-height: 1.4;
      }

      .footer-right {
        text-align: right;
      }

      .footer-help {
        font-weight: 800;
        color: #0f172a;
      }

      .muted {
        color: #64748b;
      }

      .status-confirmed {
        background: #0d9488;
      }

      .status-pending {
        background: #b45309;
      }

      .ticket-box.compact .ticket-box-body {
        padding: 10px 12px;
      }

      @media (max-width: 860px) {
        .ticket-grid,
        .ticket-grid-bottom {
          grid-template-columns: 1fr;
        }

        .ticket-footer {
          flex-direction: column;
        }

        .footer-right {
          text-align: left;
        }

        .qr-card {
          width: 100%;
        }
      }
    </style>
  </head>
  <body style="--ticket-scale:${layoutScale};">
    <div class="pdf-page">
      <div class="ticket-scale">
        <div class="ticket-card ${view.totalPassengers > 4 ? "compact" : ""}">
          <header class="ticket-header">
            <div class="brand">
              <div class="brand-mark">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <rect x="4" y="3" width="16" height="13" rx="3" stroke="white" stroke-width="1.7"/>
                  <path d="M6.5 7H17.5" stroke="white" stroke-width="1.7" stroke-linecap="round"/>
                  <path d="M7 16.5V19" stroke="white" stroke-width="1.7" stroke-linecap="round"/>
                  <path d="M17 16.5V19" stroke="white" stroke-width="1.7" stroke-linecap="round"/>
                  <circle cx="8.3" cy="18" r="1.15" fill="white"/>
                  <circle cx="15.7" cy="18" r="1.15" fill="white"/>
                  <path d="M5 13h14" stroke="white" stroke-width="1.2" stroke-linecap="round"/>
                </svg>
              </div>
              <div>
                <p class="brand-name">${escapeHtml(view.companyName)}</p>
                <p class="brand-tag">${escapeHtml(view.companyTag)}</p>
              </div>
            </div>
            <div style="text-align:right;">
              <div class="status-chip ${view.isConfirmed ? "status-confirmed" : "status-pending"}">${escapeHtml(view.statusText)}</div>
              <div style="margin-top:6px;font-size:12px;font-weight:700;letter-spacing:0.02em;color:rgba(255,255,255,0.88);">Booking Confirmed: ${escapeHtml(view.routeLabel)}</div>
            </div>
          </header>

          <div class="ticket-body">
            <p class="greeting">Hi <strong>${escapeHtml(view.greetingName)}</strong>,</p>
            <p class="subcopy">Your payment was successful and this PDF is your digital ticket for boarding. Please keep it ready while traveling.</p>

            <div class="ticket-grid">
              <section class="ticket-box">
                <div class="ticket-box-header">Trip Summary</div>
                <div class="ticket-box-body">
                  <table class="summary-table" role="presentation">
                    <tbody>
                      <tr>
                        <td class="summary-label">Booking Reference</td>
                        <td class="summary-value">${escapeHtml(view.bookingReference)}</td>
                      </tr>
                      <tr>
                        <td class="summary-label">Date of Travel</td>
                        <td class="summary-value">${escapeHtml(view.travelDate)}</td>
                      </tr>
                      <tr>
                        <td class="summary-label">Route</td>
                        <td class="summary-value">${escapeHtml(view.routeLabel)}</td>
                      </tr>
                      <tr>
                        <td class="summary-label">Seat Number</td>
                        <td class="summary-value">${escapeHtml(view.seatNumbers)}</td>
                      </tr>
                      <tr>
                        <td class="summary-label">Bus Service</td>
                        <td class="summary-value">${escapeHtml(view.busName)}${view.vehicleNumber ? ` - ${escapeHtml(view.vehicleNumber)}` : ""}</td>
                      </tr>
                    </tbody>
                  </table>

                  <div class="passenger-strip">
                    ${view.passengers.map((passenger, index) => `<span class="passenger-pill">${escapeHtml(formatPassengerLabel(passenger, index))}</span>`).join("")}
                  </div>
                </div>
              </section>

              <section class="ticket-box">
                <div class="ticket-box-header">Departure Information</div>
                <div class="ticket-box-body">
                  <div class="departure-hero">
                    <span class="label">Boarding Time</span>
                    <span class="value">${escapeHtml(view.boardingTime)}</span>
                    <div class="departure-note">Please arrive 15 mins early</div>
                  </div>

                  <div class="detail-row" style="margin-top:10px;">
                    <span class="detail-label">Departure</span>
                    <span class="detail-value">${escapeHtml(view.departureTime)}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Location</span>
                    <span class="detail-value">${escapeHtml(view.boardingPoint)}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Platform</span>
                    <span class="detail-value">${escapeHtml(view.platformLabel)}</span>
                  </div>
                  <div class="detail-row">
                    <span class="detail-label">Arrival</span>
                    <span class="detail-value">${escapeHtml(view.arrivalTime)}</span>
                  </div>
                </div>
              </section>

              <aside class="qr-card">
                <span class="qr-chip">Your Digital Ticket</span>
                ${
                  qrDataUrl
                    ? `<img src="${escapeHtml(qrDataUrl)}" alt="Ticket QR" class="qr-image" />`
                    : `<div class="qr-image empty">QR Loading</div>`
                }
                <p class="qr-caption">Scan this code at the gate for contactless verification and quick boarding.</p>
                <p class="qr-booking">Booking: ${escapeHtml(view.bookingReference)}</p>
              </aside>
            </div>

            <div class="ticket-grid-bottom">
              <section class="ticket-box">
                <div class="ticket-box-header">Payment Receipt</div>
                <div class="ticket-box-body">
                  <div class="payment-grid">
                    <div class="payment-row">
                      <span class="label">Base Fare</span>
                      <span class="value">${escapeHtml(view.baseFare)}</span>
                    </div>
                    <div class="payment-row">
                      <span class="label">Booking Fee</span>
                      <span class="value">${escapeHtml(view.bookingFee)}</span>
                    </div>
                    <div class="payment-total">
                      <span>Total Paid</span>
                      <span>${escapeHtml(view.totalAmount)}</span>
                    </div>
                    <div class="payment-row" style="padding-bottom:0;border-bottom:0;">
                      <span class="label">Payment Method</span>
                      <span class="value">${escapeHtml(view.paymentProvider)}${view.paymentReference ? ` • ${escapeHtml(view.paymentReference)}` : ""}</span>
                    </div>
                  </div>
                </div>
              </section>

              <section class="ticket-box">
                <div class="ticket-box-header">Important Instructions</div>
                <div class="ticket-box-body">
                  <div class="instructions-list">
                    <div class="instruction-item">
                      <div class="instruction-icon">1</div>
                      <div>Carry a valid government-issued ID that matches the passenger name on the booking.</div>
                    </div>
                    <div class="instruction-item">
                      <div class="instruction-icon">2</div>
                      <div>Keep the PDF or QR code visible during boarding for fast verification.</div>
                    </div>
                    <div class="instruction-item">
                      <div class="instruction-icon">3</div>
                      <div>Reach the boarding point early and confirm your seat numbers before departure.</div>
                    </div>
                    <div class="instruction-item">
                      <div class="instruction-icon">4</div>
                      <div>For support or schedule changes, contact the bus service or your booking help desk immediately.</div>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <footer class="ticket-footer">
              <div class="footer-block">
                <div class="footer-badge">❤</div>
                <div>
                  <p class="footer-title">Safe Travels, ${escapeHtml(view.companyName)} Team</p>
                  <p class="footer-small">Confirmed at ${escapeHtml(view.confirmedAt)}${view.paymentStatus ? ` • Payment ${escapeHtml(view.paymentStatus)}` : ""}</p>
                </div>
              </div>

              <div class="footer-right">
                <p class="footer-help">Need Help?</p>
                <p class="footer-small">${escapeHtml(view.busPhone !== "N/A" ? `Call ${view.busPhone} or use your booking ID for support.` : `Use your booking ID ${view.bookingReference} for support.`)}</p>
              </div>
            </footer>
          </div>
      </div>
    </div>
  </body>
</html>`;
};

module.exports = {
  buildTicketHtml,
  buildTicketViewModel,
};
