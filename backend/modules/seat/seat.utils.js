const DEFAULT_SEAT_PRICE = 0;

const normalizeSeatLabel = (value) => String(value || "").trim().toUpperCase().replace(/\s+/g, "");
const normalizeSeatType = (value) => {
  const normalized = String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized === "SLEEPER") return "SLEEPER";
  if (normalized === "SHARED_SLEEPER") return "SHARED_SLEEPER";
  return "SEATER";
};
const sortSeatLabels = (a, b) => String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });
const toFinitePrice = (value, fallbackValue = DEFAULT_SEAT_PRICE) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallbackValue;
};

const buildSeatQueryValues = (seatLabels) => {
  const values = new Set();
  (Array.isArray(seatLabels) ? seatLabels : []).forEach((label) => {
    values.add(label);
    if (/^\d+$/.test(label)) {
      values.add(Number(label));
    }
  });
  return [...values];
};

const buildSeatCatalog = (bus, fallbackPrice = DEFAULT_SEAT_PRICE) => {
  const catalog = new Map();
  const rawDecks = Array.isArray(bus?.decks) ? bus.decks : [];

  rawDecks.forEach((deck, deckIdx) => {
    const deckNumber = Number.isFinite(Number(deck?.deckNumber)) && Number(deck.deckNumber) > 0
      ? Math.trunc(Number(deck.deckNumber))
      : deckIdx + 1;
    const deckName = String(deck?.name || "").trim() || (deckNumber === 1 ? "Lower Deck" : `Deck ${deckNumber}`);
    const seats = Array.isArray(deck?.seats) ? deck.seats : [];

    seats.forEach((seat) => {
      const seatLabel = normalizeSeatLabel(seat?.seatNumber);
      if (!seatLabel || catalog.has(seatLabel)) return;
      catalog.set(seatLabel, {
        seatLabel,
        seatNumber: String(seat?.seatNumber || seatLabel).trim() || seatLabel,
        deckNumber,
        deckName,
        seatType: normalizeSeatType(seat?.seatType),
        price: toFinitePrice(seat?.price, fallbackPrice),
        isAvailable: seat?.isAvailable !== false,
      });
    });
  });

  if (catalog.size > 0) return catalog;

  const totalSeats = Number.isFinite(Number(bus?.totalSeats)) && Number(bus?.totalSeats) > 0
    ? Math.trunc(Number(bus.totalSeats))
    : 0;

  for (let i = 1; i <= totalSeats; i += 1) {
    const seatLabel = String(i);
    catalog.set(seatLabel, {
      seatLabel,
      seatNumber: seatLabel,
      deckNumber: 1,
      deckName: "Main Deck",
      seatType: "SEATER",
      price: toFinitePrice(fallbackPrice),
      isAvailable: true,
    });
  }

  return catalog;
};

const validateSeatSelection = (seatCatalog, seatLabels) => {
  const invalidSeats = [];
  const unavailableSeats = [];

  seatLabels.forEach((seatLabel) => {
    const seat = seatCatalog.get(seatLabel);
    if (!seat) {
      invalidSeats.push(seatLabel);
      return;
    }
    if (seat.isAvailable === false) {
      unavailableSeats.push(seatLabel);
    }
  });

  return { invalidSeats, unavailableSeats };
};

const buildSeatPriceBreakdown = (seatLabels, seatCatalog) => {
  return seatLabels
    .map((seatLabel) => {
      const seat = seatCatalog.get(seatLabel);
      if (!seat) return null;
      return {
        seatLabel,
        deckNumber: seat.deckNumber,
        deckName: seat.deckName,
        seatType: seat.seatType,
        price: toFinitePrice(seat.price),
      };
    })
    .filter(Boolean);
};

const parseSeats = (seats) => {
  if (!Array.isArray(seats) || seats.length === 0) return null;
  const parsed = seats
    .map((seat) => normalizeSeatLabel(seat))
    .filter(Boolean);
  if (parsed.length !== seats.length) return null;
  return [...new Set(parsed)].sort(sortSeatLabels);
};

module.exports = {
  DEFAULT_SEAT_PRICE,
  normalizeSeatLabel,
  normalizeSeatType,
  sortSeatLabels,
  toFinitePrice,
  buildSeatQueryValues,
  buildSeatCatalog,
  validateSeatSelection,
  buildSeatPriceBreakdown,
  parseSeats,
};
