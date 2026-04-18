import { formatCurrency } from "../../utils/helpers";

export default function BookingSummaryPanel({
  selectedSeatDetails = [],
  averagePrice = 0,
  totalPrice = 0,
  actionLoading = false,
  actionLabel = "Continue",
  onContinue,
  showDesktopAction = true,
}) {
  const hasSelection = selectedSeatDetails.length > 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-slate-900">Booking Summary</h3>
        <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
          {selectedSeatDetails.length} seat{selectedSeatDetails.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        {hasSelection ? (
          <div className="flex flex-wrap gap-2">
            {selectedSeatDetails.map((seat) => (
              <span
                key={`summary-seat-${seat.seatLabel}`}
                className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700"
              >
                {seat.seatNumber} • {formatCurrency(Number.isFinite(Number(seat.price)) ? Number(seat.price) : 0)}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">No seat selected yet.</p>
        )}
      </div>

      <div className="mt-4 space-y-2 text-sm">
        <div className="flex items-center justify-between text-slate-600">
          <span>Average price / seat</span>
          <span className="font-semibold text-slate-900">{formatCurrency(averagePrice)}</span>
        </div>
        <div className="flex items-center justify-between text-slate-600">
          <span>Total amount</span>
          <span className="text-lg font-extrabold text-[rgb(var(--seat-primary))]">{formatCurrency(totalPrice)}</span>
        </div>
      </div>

      {showDesktopAction ? (
        <button
          type="button"
          disabled={!hasSelection || actionLoading}
          onClick={onContinue}
          className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-[rgb(var(--seat-primary))] px-4 text-sm font-bold text-white transition hover:bg-[rgb(var(--seat-primary-strong))] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {actionLoading ? "Processing..." : actionLabel}
        </button>
      ) : null}
    </section>
  );
}
