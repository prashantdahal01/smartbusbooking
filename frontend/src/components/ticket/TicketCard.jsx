import { CalendarDays, Clock3, MapPin, Ticket } from "lucide-react";
import { formatCurrency } from "../../utils/helpers";

const safeText = (value, fallback = "N/A") => {
  const text = String(value || "").trim();
  return text || fallback;
};

const formatDateLabel = (rawDate) => {
  const text = String(rawDate || "").trim();
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
  String(value || "")
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");

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

const getPricePerSeat = (booking, seatCount) => {
  const explicitPrice = Number(booking?.pricePerSeat);
  if (Number.isFinite(explicitPrice) && explicitPrice >= 0) return explicitPrice;

  const schedulePrice = Number(booking?.schedule?.price);
  if (Number.isFinite(schedulePrice) && schedulePrice >= 0) return schedulePrice;

  const total = Number(booking?.totalPrice);
  if (Number.isFinite(total) && total >= 0 && seatCount > 0) {
    return Number((total / seatCount).toFixed(2));
  }

  return 0;
};

export default function TicketCard({ booking, qrCodeUrl, elementId = "ticket-pdf" }) {
  if (!booking) return null;

  const route = booking?.schedule?.route;
  const bus = booking?.schedule?.bus;
  const passenger = booking?.passenger;

  const seats = Array.isArray(booking?.seats) ? booking.seats : [];
  const seatCount = seats.length || 1;

  const ticketStatus = safeText(booking?.status, "confirmed").replace(/_/g, " ");
  const isConfirmed = String(booking?.status || "").toLowerCase() === "confirmed";

  const travelDate = formatDateLabel(booking?.schedule?.date);
  const departureTime = safeText(booking?.schedule?.time, "Time N/A");
  const arrivalTime = safeText(booking?.schedule?.arrivalTime || booking?.droppingPoint?.time, "Time N/A");

  const seatTypeLabel = getSeatTypeLabel(booking);
  const boardingPoint = safeText(booking?.boardingPoint?.name, "N/A");
  const droppingPoint = safeText(booking?.droppingPoint?.name, "N/A");

  const busTypeLabel = Array.isArray(bus?.busTypes) && bus.busTypes.length > 0
    ? bus.busTypes.map((type) => formatTokenLabel(type)).join(", ")
    : safeText(bus?.type, "AC / Seater");

  const pricePerSeat = getPricePerSeat(booking, seatCount);
  const totalAmount = Number(booking?.totalPrice);
  const safeTotal = Number.isFinite(totalAmount) && totalAmount >= 0 ? totalAmount : pricePerSeat * seatCount;

  return (
    <div id={elementId} className="ticket-print-root mx-auto w-full max-w-5xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-violet-600">SmartBus Company</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">E-Ticket</h2>
          <p className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-slate-600">
            <Ticket className="h-4 w-4 text-violet-600" />
            PNR: {safeText(booking?._id, "N/A")}
          </p>
        </div>

        <span
          className={`rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
            isConfirmed
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          }`}
        >
          {ticketStatus}
        </span>
      </header>

      <section className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Route Details</p>
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            <p><span className="font-semibold text-slate-900">From:</span> {safeText(route?.source)}</p>
            <p><span className="font-semibold text-slate-900">To:</span> {safeText(route?.destination)}</p>
            <p className="inline-flex items-center gap-2"><CalendarDays className="h-4 w-4 text-violet-600" />{travelDate}</p>
            <p className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4 text-violet-600" />Departure: {departureTime}</p>
            <p className="inline-flex items-center gap-2"><Clock3 className="h-4 w-4 text-violet-600" />Arrival: {arrivalTime}</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Passenger Details</p>
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            <p><span className="font-semibold text-slate-900">Name:</span> {safeText(passenger?.name)}</p>
            <p><span className="font-semibold text-slate-900">Contact:</span> {safeText(passenger?.phone)}</p>
            <p><span className="font-semibold text-slate-900">Total Passengers:</span> {seatCount}</p>
          </div>
        </div>
      </section>

      <section className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Seat Details</p>
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            <p><span className="font-semibold text-slate-900">Seat Numbers:</span> {seats.length > 0 ? seats.join(", ") : "N/A"}</p>
            <p><span className="font-semibold text-slate-900">Seat Type:</span> {seatTypeLabel}</p>
            <p className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-violet-600" />Boarding: {boardingPoint}</p>
            <p className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-violet-600" />Dropping: {droppingPoint}</p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bus Details</p>
          <div className="mt-3 space-y-2 text-sm text-slate-700">
            <p><span className="font-semibold text-slate-900">Bus Name:</span> {safeText(bus?.name)}</p>
            <p><span className="font-semibold text-slate-900">Bus Type:</span> {busTypeLabel}</p>
            <p><span className="font-semibold text-slate-900">Vehicle Number:</span> {safeText(bus?.vehicleNumber)}</p>
          </div>
        </div>
      </section>

      <section className="mt-4 grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
        <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Price Summary</p>
          <div className="mt-3 space-y-1 text-sm text-slate-700">
            <p><span className="font-semibold text-slate-900">Price per seat:</span> {formatCurrency(pricePerSeat)}</p>
            <p><span className="font-semibold text-slate-900">Number of seats:</span> {seatCount}</p>
            <p className="text-base font-extrabold text-violet-700">
              Total Amount: {formatCurrency(safeTotal)}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">QR Verification</p>
          {qrCodeUrl ? (
            <img src={qrCodeUrl} alt="Ticket QR" className="mt-2 h-28 w-28 rounded-lg border border-slate-200 object-contain" />
          ) : (
            <div className="mt-2 flex h-28 w-28 items-center justify-center rounded-lg border border-slate-200 text-xs text-slate-400">QR Loading</div>
          )}
          <p className="mt-2 text-[11px] text-slate-500">Booking: {safeText(booking?._id)}</p>
        </div>
      </section>
    </div>
  );
}
