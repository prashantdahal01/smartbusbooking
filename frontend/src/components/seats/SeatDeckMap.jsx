import { Armchair, BedDouble, BusFront, Layers } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const normalizeSeatLabel = (value) => String(value || "").trim().toUpperCase().replace(/\s+/g, "");

const normalizeSeatType = (value) => {
  const normalized = String(value || "SEATER").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized === "SLEEPER") return "SLEEPER";
  if (normalized === "SHARED_SLEEPER") return "SHARED_SLEEPER";
  return "SEATER";
};

const sortSeatLabels = (a, b) => String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });

const isUpperDeck = (deck) => {
  const name = String(deck?.deckName || deck?.name || "").toLowerCase();
  if (name.includes("upper")) return true;
  const deckNumber = Number(deck?.deckNumber);
  return Number.isFinite(deckNumber) && deckNumber > 1;
};

const isSleeperSeatType = (seatType) => {
  const normalized = normalizeSeatType(seatType);
  return normalized === "SLEEPER" || normalized === "SHARED_SLEEPER";
};

const seatStatusClass = {
  available: "border-emerald-300 bg-white text-emerald-700 hover:-translate-y-0.5 hover:border-emerald-500 hover:shadow-md",
  selected: "border-[rgb(var(--seat-primary))] bg-[rgb(var(--seat-primary))] text-white shadow-[0_8px_24px_rgba(249,115,22,0.35)]",
  booked: "cursor-not-allowed border-slate-300 bg-slate-200 text-slate-500",
  unavailable: "cursor-not-allowed border-slate-300 bg-slate-100 text-slate-400",
};

const getSeatPriceLabel = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) return "Rs 0";
  return `Rs ${Number.isInteger(amount) ? amount : amount.toFixed(2)}`;
};

function SeatTypeIcon({ seatType, className = "h-3.5 w-3.5" }) {
  const normalized = normalizeSeatType(seatType);
  if (normalized === "SLEEPER" || normalized === "SHARED_SLEEPER") {
    return <BedDouble className={className} />;
  }
  return <Armchair className={className} />;
}

function normalizeDecks(seatLayout, totalSeats) {
  if (Array.isArray(seatLayout) && seatLayout.length > 0) {
    return seatLayout
      .map((deck, deckIndex) => {
        const deckNumberRaw = Number(deck?.deckNumber);
        const deckNumber = Number.isFinite(deckNumberRaw) && deckNumberRaw > 0 ? Math.trunc(deckNumberRaw) : deckIndex + 1;
        const deckName = String(deck?.deckName || deck?.name || "").trim() || (deckNumber === 1 ? "Lower Deck" : `Deck ${deckNumber}`);

        const seats = (Array.isArray(deck?.seats) ? deck.seats : [])
          .map((seat, seatIndex) => {
            const seatLabel = normalizeSeatLabel(seat?.seatLabel ?? seat?.seatNumber);
            if (!seatLabel) return null;

            const rowRaw = Number(seat?.row);
            const columnRaw = Number(seat?.column);
            const rowSpanRaw = Number(seat?.rowSpan ?? seat?.rowspan);
            const colSpanRaw = Number(seat?.columnSpan ?? seat?.colSpan ?? seat?.colspan);

            return {
              seatLabel,
              seatNumber: String(seat?.seatNumber || seatLabel).trim() || seatLabel,
              seatType: normalizeSeatType(seat?.seatType),
              price: Number.isFinite(Number(seat?.price)) ? Number(seat?.price) : 0,
              isAvailable: seat?.isAvailable !== false,
              row: Number.isFinite(rowRaw) && rowRaw > 0 ? Math.trunc(rowRaw) : Math.floor(seatIndex / 4) + 1,
              column: Number.isFinite(columnRaw) && columnRaw > 0 ? Math.trunc(columnRaw) : (seatIndex % 4) + 1,
              rowSpan: Number.isFinite(rowSpanRaw) && rowSpanRaw > 0 ? Math.trunc(rowSpanRaw) : 1,
              colSpan: Number.isFinite(colSpanRaw) && colSpanRaw > 0 ? Math.trunc(colSpanRaw) : 1,
            };
          })
          .filter(Boolean)
          .sort((a, b) => {
            if (a.row !== b.row) return a.row - b.row;
            if (a.column !== b.column) return a.column - b.column;
            return sortSeatLabels(a.seatLabel, b.seatLabel);
          });

        return {
          deckNumber,
          deckName,
          seats,
        };
      })
      .sort((a, b) => a.deckNumber - b.deckNumber);
  }

  const safeTotal = Number.isFinite(Number(totalSeats)) && Number(totalSeats) > 0 ? Math.trunc(Number(totalSeats)) : 0;
  const fallbackSeats = Array.from({ length: safeTotal }, (_, idx) => ({
    seatLabel: String(idx + 1),
    seatNumber: String(idx + 1),
    seatType: "SEATER",
    price: 0,
    isAvailable: true,
    row: Math.floor(idx / 4) + 1,
    column: (idx % 4) + 1,
    rowSpan: 1,
    colSpan: 1,
  }));

  return [
    {
      deckNumber: 1,
      deckName: "Lower Deck",
      seats: fallbackSeats,
    },
  ];
}

function resolveSeatStatus({ seat, bookedSet, selectedSet, lockOwnerBySeat, myUserId }) {
  const lockedBy = lockOwnerBySeat.get(seat.seatLabel);
  const lockedByOther = lockedBy !== undefined && lockedBy !== null && String(lockedBy) !== String(myUserId || "");

  if (bookedSet.has(seat.seatLabel) || lockedByOther) return "booked";
  if (seat.isAvailable === false) return "unavailable";
  if (selectedSet.has(seat.seatLabel)) return "selected";
  return "available";
}

function isSeatSelectable(status) {
  return status === "available" || status === "selected";
}

export default function SeatDeckMap({
  totalSeats = 0,
  seatLayout = [],
  bookedSeats = [],
  lockedSeats = [],
  selectedSeats = [],
  myUserId,
  onToggleSeat,
}) {
  const decks = useMemo(() => normalizeDecks(seatLayout, totalSeats), [seatLayout, totalSeats]);

  const [activeDeckNumber, setActiveDeckNumber] = useState(() => {
    const firstDeck = decks[0];
    return firstDeck?.deckNumber || 1;
  });

  useEffect(() => {
    if (!decks.length) {
      setActiveDeckNumber(1);
      return;
    }

    const exists = decks.some((deck) => deck.deckNumber === activeDeckNumber);
    if (!exists) {
      setActiveDeckNumber(decks[0].deckNumber);
    }
  }, [activeDeckNumber, decks]);

  const bookedSet = useMemo(
    () => new Set((Array.isArray(bookedSeats) ? bookedSeats : []).map(normalizeSeatLabel).filter(Boolean)),
    [bookedSeats]
  );

  const selectedSet = useMemo(
    () => new Set((Array.isArray(selectedSeats) ? selectedSeats : []).map(normalizeSeatLabel).filter(Boolean)),
    [selectedSeats]
  );

  const lockOwnerBySeat = useMemo(() => {
    const map = new Map();
    (Array.isArray(lockedSeats) ? lockedSeats : []).forEach((lock) => {
      const seatLabel = normalizeSeatLabel(lock?.seatLabel ?? lock?.seatNumber);
      const lockedBy = lock?.lockedBy?._id ?? lock?.lockedBy;
      if (!seatLabel || lockedBy == null) return;
      map.set(seatLabel, String(lockedBy));
    });
    return map;
  }, [lockedSeats]);

  const activeDeck = useMemo(
    () => decks.find((deck) => deck.deckNumber === activeDeckNumber) || decks[0] || null,
    [activeDeckNumber, decks]
  );

  const hasUpperDeck = useMemo(() => decks.some((deck) => isUpperDeck(deck)), [decks]);

  const activeDeckIsUpper = isUpperDeck(activeDeck);

  const visibleSeats = useMemo(() => {
    const rawSeats = Array.isArray(activeDeck?.seats) ? activeDeck.seats : [];

    if (!activeDeckIsUpper) return rawSeats;

    return rawSeats.filter((seat) => {
      if (!isSleeperSeatType(seat.seatType)) return false;

      const status = resolveSeatStatus({
        seat,
        bookedSet,
        selectedSet,
        lockOwnerBySeat,
        myUserId,
      });

      // Upper deck shows only currently available/selected sleeper seats.
      if (status === "booked" || status === "unavailable") return false;
      return true;
    });
  }, [activeDeck, activeDeckIsUpper, bookedSet, lockOwnerBySeat, myUserId, selectedSet]);

  const seatByGridKey = useMemo(() => {
    const map = new Map();
    visibleSeats.forEach((seat) => {
      map.set(`${seat.row}:${seat.column}`, seat);
    });
    return map;
  }, [visibleSeats]);

  const gridShape = useMemo(() => {
    if (!visibleSeats.length) return { rows: 7, cols: 5 };

    const cols = Math.max(
      5,
      ...visibleSeats.map((seat) => seat.column + Math.max(1, seat.colSpan || 1) - 1)
    );
    const rows = Math.max(
      7,
      ...visibleSeats.map((seat) => seat.row + Math.max(1, seat.rowSpan || 1) - 1)
    );

    return { rows, cols };
  }, [visibleSeats]);

  const showAisle = gridShape.cols >= 5;
  const aisleColumn = showAisle ? 3 : -1;

  return (
    <div className="space-y-4">
      {hasUpperDeck ? (
        <div className="flex flex-wrap items-center gap-2">
          {decks.map((deck) => {
            const active = deck.deckNumber === activeDeckNumber;
            const deckUpper = isUpperDeck(deck);

            return (
              <button
                key={`deck-tab-${deck.deckNumber}`}
                type="button"
                onClick={() => setActiveDeckNumber(deck.deckNumber)}
                className={`inline-flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                  active
                    ? "border-[rgb(var(--seat-primary))] bg-[rgba(249,115,22,0.12)] text-[rgb(var(--seat-primary))]"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                {deckUpper ? "Upper Deck" : "Lower Deck"}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <span className="font-semibold tracking-wide">Bus Front</span>
          <div className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 font-semibold text-slate-700">
            <BusFront className="h-3.5 w-3.5" /> Driver
          </div>
        </div>

        <div className="overflow-auto rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
          {visibleSeats.length === 0 ? (
            <div className="grid min-h-72 place-items-center rounded-xl border border-dashed border-slate-300 bg-white text-center text-sm text-slate-500">
              {activeDeckIsUpper
                ? "No available sleeper seats in upper deck"
                : "Seat layout is not available"}
            </div>
          ) : (
            <div
              className="mx-auto grid min-w-75 gap-2"
              style={{
                gridTemplateColumns: `repeat(${gridShape.cols}, minmax(3.1rem, 1fr))`,
              }}
            >
              {Array.from({ length: gridShape.rows * gridShape.cols }).map((_, index) => {
                const row = Math.floor(index / gridShape.cols) + 1;
                const col = (index % gridShape.cols) + 1;
                const seat = seatByGridKey.get(`${row}:${col}`);

                if (!seat) {
                  if (showAisle && col === aisleColumn) {
                    return (
                      <div
                        key={`aisle-${row}-${col}`}
                        className="h-16 rounded-lg border border-dashed border-slate-200 bg-slate-100/70"
                        aria-hidden
                      />
                    );
                  }

                  return (
                    <div
                      key={`blank-${row}-${col}`}
                      className="h-16 rounded-lg border border-transparent"
                      aria-hidden
                    />
                  );
                }

                const status = resolveSeatStatus({
                  seat,
                  bookedSet,
                  selectedSet,
                  lockOwnerBySeat,
                  myUserId,
                });
                const selectable = isSeatSelectable(status);

                return (
                  <button
                    key={`seat-${seat.seatLabel}`}
                    type="button"
                    disabled={!selectable}
                    onClick={() => (selectable ? onToggleSeat?.(seat.seatLabel) : undefined)}
                    className={`group relative h-16 rounded-lg border text-xs font-semibold transition-all duration-200 ${
                      seatStatusClass[status]
                    }`}
                    title={`${seat.seatNumber} | ${seat.seatType.toLowerCase().replace(/_/g, " ")} | ${getSeatPriceLabel(seat.price)}`}
                  >
                    <span className="pointer-events-none absolute -top-7 left-1/2 -translate-x-1/2 rounded bg-slate-900 px-2 py-0.5 text-[10px] text-white opacity-0 transition group-hover:opacity-100">
                      {seat.seatNumber}
                    </span>
                    <div className="flex h-full flex-col items-center justify-center gap-0.5 leading-none">
                      <SeatTypeIcon seatType={seat.seatType} className="h-3.5 w-3.5" />
                      <span>{seat.seatNumber}</span>
                      <span className="text-[9px] font-bold opacity-90">{getSeatPriceLabel(seat.price)}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-xs text-slate-600">
        <span className="inline-flex items-center gap-2">
          <Armchair className="h-3.5 w-3.5 text-slate-600" /> Seater
        </span>
        <span className="inline-flex items-center gap-2">
          <BedDouble className="h-3.5 w-3.5 text-slate-600" /> Sleeper
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded border border-emerald-400 bg-white" /> Available
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded border border-[rgb(var(--seat-primary))] bg-[rgb(var(--seat-primary))]" /> Selected
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3.5 w-3.5 rounded border border-slate-300 bg-slate-200" /> Booked
        </span>
      </div>
    </div>
  );
}
