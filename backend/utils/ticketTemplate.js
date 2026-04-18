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

  return {
    companyName: "SmartBus Company",
    bookingId: safeText(booking?._id),
    statusText: safeText(booking?.status, "confirmed").replace(/_/g, " "),
    isConfirmed: safeString(booking?.status).toLowerCase() === "confirmed",

    from: safeText(route?.source),
    to: safeText(route?.destination),
    travelDate: formatDateLabel(booking?.schedule?.date),
    departureTime: safeText(booking?.schedule?.time, "Time N/A"),
    arrivalTime: safeText(booking?.schedule?.arrivalTime || booking?.droppingPoint?.time, "Time N/A"),

    passengers,
    totalPassengers: passengers.length,

    seatNumbers: seats.length > 0 ? seats.join(", ") : "N/A",
    seatType: getSeatTypeLabel(booking),
    boardingPoint: safeText(booking?.boardingPoint?.name),
    droppingPoint: safeText(booking?.droppingPoint?.name),

    busName: safeText(bus?.name),
    busType: getBusTypeLabel(booking),
    vehicleNumber: safeText(bus?.vehicleNumber),
    busPhone: safeText(bus?.phone || bus?.contactNumber || bus?.mobileNumber, "N/A"),

    pricePerSeat: formatCurrency(pricePerSeat),
    seatCount,
    totalAmount: formatCurrency(totalAmount),
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
  const passengerRowsHtml = buildPassengerRowsHtml(view.passengers);

  let qrDataUrl = "";
  try {
    qrDataUrl = await QRCode.toDataURL(String(view.bookingId), {
      width: 220,
      margin: 1,
      color: {
        dark: "#5b21b6",
        light: "#ffffff",
      },
    });
  } catch {
    qrDataUrl = "";
  }

  const statusClass = view.isConfirmed
    ? "border:1px solid #bbf7d0;background:#ecfdf5;color:#15803d;"
    : "border:1px solid #fde68a;background:#fffbeb;color:#b45309;";

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Ticket ${escapeHtml(view.bookingId)}</title>
    <style>
      @page {
        size: A4;
        margin: 6mm;
      }

      * {
        box-sizing: border-box;
      }

      html,
      body {
        margin: 0;
        padding: 0;
        background: #ffffff;
        font-family: "Manrope", "Segoe UI", "Helvetica Neue", Arial, sans-serif;
        color: #0f172a;
      }

      .pdf-page {
        width: 198mm;
        min-height: 285mm;
        margin: 0 auto;
        background: #f1f5f9;
      }

      .ticket-scale {
        width: calc(100% / var(--ticket-scale, 1));
        transform: scale(var(--ticket-scale, 1));
        transform-origin: top center;
      }

      .ticket-card {
        width: 100%;
        border-radius: 16px;
        border: 1px solid #e2e8f0;
        background: #ffffff;
        padding: 20px;
        box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
      }

      .ticket-card,
      .box,
      .summary-wrap,
      .summary,
      .passenger-row,
      .route-passenger-grid,
      .seat-bus-grid {
        break-inside: avoid;
        page-break-inside: avoid;
      }

      .header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        border-bottom: 1px solid #e2e8f0;
        padding-bottom: 14px;
      }

      .heading-top {
        margin: 0;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-weight: 600;
        color: #7c3aed;
      }

      .heading-main {
        margin: 4px 0 0;
        font-size: 24px;
        line-height: 1.1;
        letter-spacing: -0.025em;
        font-weight: 800;
        color: #0f172a;
      }

      .pnr {
        margin: 4px 0 0;
        font-size: 14px;
        font-weight: 600;
        color: #475569;
      }

      .status-badge {
        border-radius: 999px;
        padding: 6px 12px;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.025em;
        font-weight: 600;
        ${statusClass}
      }

      .route-passenger-grid {
        margin-top: 16px;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .seat-bus-grid {
        margin-top: 14px;
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 14px;
      }

      .box {
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        background: #ffffff;
        padding: 14px;
      }

      .box.soft {
        background: #f8fafc;
      }

      .box-title {
        margin: 0;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.025em;
        color: #64748b;
        font-weight: 600;
      }

      .meta-list {
        margin-top: 10px;
        display: grid;
        gap: 6px;
        font-size: 13px;
        line-height: 1.35;
        color: #334155;
      }

      .meta-label {
        font-weight: 600;
        color: #0f172a;
      }

      .passenger-list {
        margin-top: 10px;
        display: grid;
        gap: 8px;
      }

      .passenger-row {
        border: 1px solid #e2e8f0;
        border-radius: 10px;
        background: #ffffff;
        padding: 8px 10px;
      }

      .passenger-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 10px;
        margin-bottom: 5px;
      }

      .passenger-index {
        font-size: 12px;
        font-weight: 700;
        color: #6d28d9;
      }

      .passenger-seat {
        font-size: 11px;
        font-weight: 600;
        color: #475569;
      }

      .passenger-meta {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 4px 10px;
        font-size: 12px;
        color: #334155;
      }

      .summary-wrap {
        margin-top: 14px;
        display: grid;
        grid-template-columns: 1fr auto;
        gap: 14px;
        align-items: center;
      }

      .summary {
        border: 1px solid #ddd6fe;
        border-radius: 12px;
        background: #f5f3ff;
        padding: 14px;
      }

      .summary-title {
        margin: 0;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.025em;
        color: #6d28d9;
        font-weight: 600;
      }

      .summary-list {
        margin-top: 10px;
        display: grid;
        gap: 4px;
        font-size: 13px;
        line-height: 1.35;
        color: #334155;
      }

      .summary-total {
        margin-top: 1px;
        font-size: 16px;
        font-weight: 800;
        color: #6d28d9;
      }

      .qr-box {
        width: fit-content;
        min-width: 136px;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        background: #ffffff;
        padding: 10px;
        text-align: center;
      }

      .qr-title {
        margin: 0;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.025em;
        font-weight: 600;
        color: #64748b;
      }

      .qr-image {
        margin-top: 8px;
        width: 112px;
        height: 112px;
        border: 1px solid #e2e8f0;
        border-radius: 8px;
        object-fit: contain;
      }

      .qr-image.empty {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        color: #94a3b8;
      }

      .qr-id {
        margin-top: 8px;
        font-size: 11px;
        color: #64748b;
      }

      .ticket-card.dense {
        padding: 16px;
      }

      .ticket-card.dense .meta-list {
        gap: 4px;
        font-size: 12px;
      }

      .ticket-card.dense .passenger-row {
        padding: 7px 8px;
      }

      .ticket-card.dense .passenger-meta {
        font-size: 11px;
      }

      .ticket-card.dense .summary-list {
        font-size: 12px;
      }

      @media (max-width: 860px) {
        .route-passenger-grid,
        .seat-bus-grid,
        .summary-wrap,
        .passenger-meta {
          grid-template-columns: 1fr;
        }

        .qr-box {
          width: 100%;
        }
      }
    </style>
  </head>
  <body style="--ticket-scale:${layoutScale};">
    <div class="pdf-page">
      <div class="ticket-scale">
        <div class="ticket-card ${view.totalPassengers > 4 ? "dense" : ""}">
          <div class="header">
            <div>
              <p class="heading-top">${escapeHtml(view.companyName)}</p>
              <h1 class="heading-main">E-Ticket</h1>
              <p class="pnr">PNR: ${escapeHtml(view.bookingId)}</p>
            </div>
            <span class="status-badge">${escapeHtml(view.statusText)}</span>
          </div>

          <div class="route-passenger-grid">
            <section class="box soft">
              <p class="box-title">Route Details</p>
              <div class="meta-list">
                <div><span class="meta-label">From:</span> ${escapeHtml(view.from)}</div>
                <div><span class="meta-label">To:</span> ${escapeHtml(view.to)}</div>
                <div><span class="meta-label">Travel Date:</span> ${escapeHtml(view.travelDate)}</div>
                <div><span class="meta-label">Departure:</span> ${escapeHtml(view.departureTime)}</div>
                <div><span class="meta-label">Arrival:</span> ${escapeHtml(view.arrivalTime)}</div>
              </div>
            </section>

            <section class="box soft">
              <p class="box-title">Passenger Details</p>
              <div class="meta-list">
                <div><span class="meta-label">Total Passengers:</span> ${escapeHtml(view.totalPassengers)}</div>
              </div>
              <div class="passenger-list">
                ${passengerRowsHtml}
              </div>
            </section>
          </div>

          <div class="seat-bus-grid">
            <section class="box">
              <p class="box-title">Seat Details</p>
              <div class="meta-list">
                <div><span class="meta-label">Seat Numbers:</span> ${escapeHtml(view.seatNumbers)}</div>
                <div><span class="meta-label">Seat Type:</span> ${escapeHtml(view.seatType)}</div>
                <div><span class="meta-label">Boarding:</span> ${escapeHtml(view.boardingPoint)}</div>
                <div><span class="meta-label">Dropping:</span> ${escapeHtml(view.droppingPoint)}</div>
              </div>
            </section>

            <section class="box">
              <p class="box-title">Bus Details</p>
              <div class="meta-list">
                <div><span class="meta-label">Bus Name:</span> ${escapeHtml(view.busName)}</div>
                <div><span class="meta-label">Bus Type:</span> ${escapeHtml(view.busType)}</div>
                <div><span class="meta-label">Vehicle Number:</span> ${escapeHtml(view.vehicleNumber)}</div>
                <div><span class="meta-label">Bus Phone:</span> ${escapeHtml(view.busPhone)}</div>
              </div>
            </section>
          </div>

          <div class="summary-wrap">
            <section class="summary">
              <p class="summary-title">Price Summary</p>
              <div class="summary-list">
                <div><span class="meta-label">Price per seat:</span> ${escapeHtml(view.pricePerSeat)}</div>
                <div><span class="meta-label">Number of seats:</span> ${escapeHtml(view.seatCount)}</div>
                <div class="summary-total">Total Amount: ${escapeHtml(view.totalAmount)}</div>
              </div>
            </section>

            <aside class="qr-box">
              <p class="qr-title">QR Verification</p>
              ${
                qrDataUrl
                  ? `<img src="${escapeHtml(qrDataUrl)}" alt="Ticket QR" class="qr-image" />`
                  : `<div class="qr-image empty">QR Loading</div>`
              }
              <p class="qr-id">Booking: ${escapeHtml(view.bookingId)}</p>
            </aside>
          </div>
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
