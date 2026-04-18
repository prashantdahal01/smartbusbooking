import { memo, useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { Armchair, Grid3X3, Layers, SlidersHorizontal, Wand2, X } from "lucide-react";
import {
  BUS_TYPE_OPTIONS,
  deriveBusCategoryFromBusTypes,
  getBusTypesFromBus,
  normalizeBusTypes,
} from "../../utils/busTypeUtils";
import { toAbsoluteAssetUrl } from "../../utils/helpers";

const SEAT_TYPE_OPTIONS = [
  { value: "SEATER", label: "Seater" },
  { value: "SLEEPER", label: "Sleeper" },
  { value: "SHARED_SLEEPER", label: "Shared Sleeper" },
];

const SEAT_TYPE_SET = new Set(SEAT_TYPE_OPTIONS.map((item) => item.value));

const DEFAULT_PRICE_BY_SEAT_TYPE = {
  SEATER: 1800,
  SLEEPER: 2800,
  SHARED_SLEEPER: 3000,
};

const TEMPLATE_OPTIONS = [
  {
    value: "AC_SEATER_2X2",
    label: "AC Seater (2x2)",
    recommendedBusTypes: ["AC", "SINGLE_SEATER"],
    defaultSeatType: "SEATER",
    defaultPrice: 1800,
  },
  {
    value: "NON_AC_SEATER",
    label: "Non-AC Seater",
    recommendedBusTypes: ["SINGLE_SEATER"],
    defaultSeatType: "SEATER",
    defaultPrice: 1400,
  },
  {
    value: "AC_SLEEPER_DOUBLE_DECK",
    label: "AC Sleeper (Lower + Upper Deck)",
    recommendedBusTypes: ["AC", "DOUBLE_SLEEPER"],
    defaultSeatType: "SLEEPER",
    defaultPrice: 2800,
  },
  {
    value: "MIXED_SEATER_SLEEPER",
    label: "Mixed (Seater + Sleeper)",
    recommendedBusTypes: ["AC", "SINGLE_SEATER", "SINGLE_SLEEPER"],
    defaultSeatType: "SEATER",
    defaultPrice: 2200,
  },
];

const DEFAULT_TEMPLATE = "AC_SEATER_2X2";

const normalizeSeatLabel = (value) => String(value || "").trim().toUpperCase().replace(/\s+/g, "");
const sortSeatLabels = (a, b) => String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });

const toSafePrice = (value, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
};

const toSafePositiveInt = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return "";
  return Math.trunc(parsed);
};

const normalizeSeatType = (value) => {
  const normalized = String(value || "SEATER").trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (normalized === "SLEEPER") return "SLEEPER";
  if (normalized === "SHARED_SLEEPER") return "SHARED_SLEEPER";
  return "SEATER";
};

const getSeatKey = (deckIndex, seatIndex) => `${deckIndex}:${seatIndex}`;

const parseSeatKey = (key) => {
  const [deckRaw, seatRaw] = String(key || "").split(":");
  const deckIndex = Number(deckRaw);
  const seatIndex = Number(seatRaw);
  if (!Number.isFinite(deckIndex) || !Number.isFinite(seatIndex)) return null;
  return { deckIndex, seatIndex };
};

const createSeat = ({
  seatNumber,
  seatType = "SEATER",
  price = 0,
  isAvailable = true,
  row,
  column,
} = {}) => ({
  seatNumber: normalizeSeatLabel(seatNumber),
  seatType: normalizeSeatType(seatType),
  price: toSafePrice(price, 0),
  isAvailable: isAvailable !== false,
  row: toSafePositiveInt(row),
  column: toSafePositiveInt(column),
});

const createDeck = (deckNumber, name, seats) => ({
  deckNumber,
  name,
  seats: Array.isArray(seats) ? seats : [],
});

const buildSeater22Seats = ({ leftPrefix, rightPrefix, rows, price, includeNepaliFrontLabels = false }) => {
  const seats = [];
  const seatPrice = toSafePrice(price, DEFAULT_PRICE_BY_SEAT_TYPE.SEATER);

  if (includeNepaliFrontLabels) {
    seats.push(createSeat({ seatNumber: "KA", seatType: "SEATER", price: seatPrice, row: 1, column: 1, isAvailable: false }));
    seats.push(createSeat({ seatNumber: "KHA", seatType: "SEATER", price: seatPrice, row: 1, column: 2, isAvailable: false }));
    seats.push(createSeat({ seatNumber: "GA", seatType: "SEATER", price: seatPrice, row: 1, column: 4, isAvailable: false }));
    seats.push(createSeat({ seatNumber: "GHA", seatType: "SEATER", price: seatPrice, row: 1, column: 5, isAvailable: false }));
  }

  let leftNumber = 1;
  let rightNumber = 1;
  const rowStart = includeNepaliFrontLabels ? 2 : 1;

  for (let rowOffset = 0; rowOffset < rows; rowOffset += 1) {
    const row = rowStart + rowOffset;

    seats.push(createSeat({ seatNumber: `${leftPrefix}${leftNumber}`, seatType: "SEATER", price: seatPrice, row, column: 1 }));
    leftNumber += 1;
    seats.push(createSeat({ seatNumber: `${leftPrefix}${leftNumber}`, seatType: "SEATER", price: seatPrice, row, column: 2 }));
    leftNumber += 1;

    seats.push(createSeat({ seatNumber: `${rightPrefix}${rightNumber}`, seatType: "SEATER", price: seatPrice, row, column: 4 }));
    rightNumber += 1;
    seats.push(createSeat({ seatNumber: `${rightPrefix}${rightNumber}`, seatType: "SEATER", price: seatPrice, row, column: 5 }));
    rightNumber += 1;
  }

  return seats;
};

const buildSleeperLowerSeats = ({ price }) => {
  const seatPrice = toSafePrice(price, DEFAULT_PRICE_BY_SEAT_TYPE.SLEEPER);
  const seats = [];

  seats.push(createSeat({ seatNumber: "KA", seatType: "SLEEPER", price: seatPrice, row: 1, column: 1, isAvailable: false }));
  seats.push(createSeat({ seatNumber: "KHA", seatType: "SLEEPER", price: seatPrice, row: 1, column: 2, isAvailable: false }));
  seats.push(createSeat({ seatNumber: "GA", seatType: "SLEEPER", price: seatPrice, row: 1, column: 4, isAvailable: false }));
  seats.push(createSeat({ seatNumber: "GHA", seatType: "SLEEPER", price: seatPrice, row: 1, column: 5, isAvailable: false }));

  let leftNumber = 1;
  let rightNumber = 1;
  for (let row = 2; row <= 8; row += 1) {
    seats.push(createSeat({ seatNumber: `A${leftNumber}`, seatType: "SLEEPER", price: seatPrice, row, column: 1 }));
    leftNumber += 1;
    seats.push(createSeat({ seatNumber: `A${leftNumber}`, seatType: "SLEEPER", price: seatPrice, row, column: 2 }));
    leftNumber += 1;

    seats.push(createSeat({ seatNumber: `B${rightNumber}`, seatType: "SLEEPER", price: seatPrice, row, column: 4 }));
    rightNumber += 1;
    seats.push(createSeat({ seatNumber: `B${rightNumber}`, seatType: "SLEEPER", price: seatPrice, row, column: 5 }));
    rightNumber += 1;
  }

  seats.push(createSeat({ seatNumber: "I5", seatType: "SLEEPER", price: seatPrice, row: 9, column: 3 }));
  return seats;
};

const buildUpperSleeperSeats = ({ price, seatType = "SHARED_SLEEPER", rows = 4 }) => {
  const safeType = normalizeSeatType(seatType);
  const seatPrice = toSafePrice(price, DEFAULT_PRICE_BY_SEAT_TYPE[safeType] || DEFAULT_PRICE_BY_SEAT_TYPE.SLEEPER);
  const seats = [];

  let upALabel = 1;
  let upBLabel = 1;

  for (let row = 1; row <= rows; row += 1) {
    seats.push(createSeat({ seatNumber: `UPA${upALabel}`, seatType: safeType, price: seatPrice, row, column: 1 }));
    upALabel += 1;
    seats.push(createSeat({ seatNumber: `UPA${upALabel}`, seatType: safeType, price: seatPrice, row, column: 2 }));
    upALabel += 1;

    seats.push(createSeat({ seatNumber: `UPB${upBLabel}`, seatType: safeType, price: seatPrice, row, column: 4 }));
    upBLabel += 1;
    seats.push(createSeat({ seatNumber: `UPB${upBLabel}`, seatType: safeType, price: seatPrice, row, column: 5 }));
    upBLabel += 1;
  }

  return seats;
};

const generateTemplateDecks = (templateId) => {
  if (templateId === "NON_AC_SEATER") {
    return {
      busTypes: ["SINGLE_SEATER"],
      defaultPrice: 1400,
      defaultSeatType: "SEATER",
      decks: [createDeck(1, "Main Deck", buildSeater22Seats({ leftPrefix: "A", rightPrefix: "B", rows: 8, price: 1400 }))],
    };
  }

  if (templateId === "AC_SLEEPER_DOUBLE_DECK") {
    return {
      busTypes: ["AC", "DOUBLE_SLEEPER"],
      defaultPrice: 2800,
      defaultSeatType: "SLEEPER",
      decks: [
        createDeck(1, "Lower Deck", buildSleeperLowerSeats({ price: 2800 })),
        createDeck(2, "Upper Deck", buildUpperSleeperSeats({ price: 2800, seatType: "SHARED_SLEEPER", rows: 4 })),
      ],
    };
  }

  if (templateId === "MIXED_SEATER_SLEEPER") {
    return {
      busTypes: ["AC", "SINGLE_SEATER", "SINGLE_SLEEPER"],
      defaultPrice: 2200,
      defaultSeatType: "SEATER",
      decks: [
        createDeck(1, "Lower Deck", buildSeater22Seats({ leftPrefix: "A", rightPrefix: "B", rows: 6, price: 1900, includeNepaliFrontLabels: true })),
        createDeck(2, "Upper Deck", buildUpperSleeperSeats({ price: 2600, seatType: "SLEEPER", rows: 3 })),
      ],
    };
  }

  return {
    busTypes: ["AC", "SINGLE_SEATER"],
    defaultPrice: 1800,
    defaultSeatType: "SEATER",
    decks: [
      createDeck(
        1,
        "Main Deck",
        buildSeater22Seats({
          leftPrefix: "A",
          rightPrefix: "B",
          rows: 8,
          price: 1800,
          includeNepaliFrontLabels: true,
        })
      ),
    ],
  };
};

const inferTemplateFromBus = (busTypes, deckCount) => {
  const normalizedTypes = normalizeBusTypes(busTypes);
  const hasSleeperType = normalizedTypes.some((type) => type.includes("SLEEPER"));
  const hasSeaterType = normalizedTypes.some((type) => type.includes("SEATER"));

  if (hasSleeperType && hasSeaterType && deckCount > 1) return "MIXED_SEATER_SLEEPER";
  if (hasSleeperType) return "AC_SLEEPER_DOUBLE_DECK";
  if (normalizedTypes.includes("AC")) return "AC_SEATER_2X2";
  return "NON_AC_SEATER";
};

const normalizeDecksFromBus = (bus, busTypes) => {
  const sourceDecks = Array.isArray(bus?.decks) ? bus.decks : [];
  const hasSleeperType = normalizeBusTypes(busTypes).some((type) => type.includes("SLEEPER"));
  const fallbackSeatType = hasSleeperType ? "SLEEPER" : "SEATER";
  const fallbackPrice = DEFAULT_PRICE_BY_SEAT_TYPE[fallbackSeatType] || 1800;

  if (sourceDecks.length > 0) {
    return sourceDecks.map((deck, deckIndex) => {
      const deckNumberRaw = Number(deck?.deckNumber);
      const deckNumber = Number.isFinite(deckNumberRaw) && deckNumberRaw > 0 ? Math.trunc(deckNumberRaw) : deckIndex + 1;
      const name = String(deck?.name || "").trim() || (deckNumber === 1 ? "Lower Deck" : deckNumber === 2 ? "Upper Deck" : `Deck ${deckNumber}`);

      const seats = (Array.isArray(deck?.seats) ? deck.seats : []).map((seat, seatIndex) => {
        const rowRaw = Number(seat?.row);
        const columnRaw = Number(seat?.column);

        return createSeat({
          seatNumber: seat?.seatNumber || seat?.seatLabel || `D${deckNumber}S${seatIndex + 1}`,
          seatType: seat?.seatType || fallbackSeatType,
          price: seat?.price ?? fallbackPrice,
          isAvailable: seat?.isAvailable,
          row: Number.isFinite(rowRaw) && rowRaw > 0 ? Math.trunc(rowRaw) : Math.floor(seatIndex / 4) + 1,
          column: Number.isFinite(columnRaw) && columnRaw > 0 ? Math.trunc(columnRaw) : (seatIndex % 4) + 1,
        });
      });

      return createDeck(deckNumber, name, seats);
    });
  }

  const totalSeats = Number.isFinite(Number(bus?.totalSeats)) && Number(bus?.totalSeats) > 0 ? Math.trunc(Number(bus.totalSeats)) : 0;
  if (totalSeats > 0) {
    const seats = [];
    let seatNumber = 1;
    for (let row = 1; row <= Math.ceil(totalSeats / 4); row += 1) {
      for (const column of [1, 2, 4, 5]) {
        if (seatNumber > totalSeats) break;
        const prefix = column <= 2 ? "A" : "B";
        seats.push(createSeat({
          seatNumber: `${prefix}${seatNumber}`,
          seatType: fallbackSeatType,
          price: fallbackPrice,
          row,
          column,
        }));
        seatNumber += 1;
      }
    }
    return [createDeck(1, "Main Deck", seats)];
  }

  return generateTemplateDecks(inferTemplateFromBus(busTypes, sourceDecks.length)).decks;
};

const deckGridSeats = (deck, deckIndex) => {
  return (Array.isArray(deck?.seats) ? deck.seats : [])
    .map((seat, seatIndex) => {
      const rowRaw = Number(seat?.row);
      const columnRaw = Number(seat?.column);
      const row = Number.isFinite(rowRaw) && rowRaw > 0 ? Math.trunc(rowRaw) : Math.floor(seatIndex / 4) + 1;
      const column = Number.isFinite(columnRaw) && columnRaw > 0 ? Math.trunc(columnRaw) : (seatIndex % 4) + 1;

      return {
        ...seat,
        row,
        column,
        seatIndex,
        key: getSeatKey(deckIndex, seatIndex),
      };
    })
    .sort((a, b) => a.row - b.row || a.column - b.column || sortSeatLabels(a.seatNumber, b.seatNumber));
};

const getOperatorId = (bus) => {
  if (!bus?.operator) return "";
  if (typeof bus.operator === "string") return bus.operator;
  return bus.operator?._id || "";
};

const getInitialForm = (bus) => {
  const busTypes = getBusTypesFromBus(bus);
  return {
    name: String(bus?.name || ""),
    vehicleNumber: String(bus?.vehicleNumber || ""),
    phone: String(bus?.phone || bus?.contactNumber || bus?.busPhone || ""),
    operator: getOperatorId(bus),
    busTypes,
    refundPolicy: String(bus?.policies?.refundPolicy || ""),
    cancellationPolicy: String(bus?.policies?.cancellationPolicy || ""),
    dateChangePolicy: String(bus?.policies?.dateChangePolicy || ""),
    luggagePolicy: String(bus?.policies?.luggagePolicy || ""),
    decks: normalizeDecksFromBus(bus, busTypes),
  };
};

const getTypeBadgeClass = (type) => {
  const normalized = String(type || "").trim().toUpperCase();
  if (normalized === "AC") return "border-cyan-200 bg-cyan-50 text-cyan-700";
  if (normalized.includes("SLEEPER")) return "border-violet-200 bg-violet-50 text-violet-700";
  if (normalized === "SOFA_SEATER") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
};

const getSeatButtonClass = (seatType, isAvailable, isActive) => {
  if (isActive) return "border-blue-500 bg-blue-100 text-blue-800";
  if (!isAvailable) return "border-slate-300 bg-slate-100 text-slate-400";
  if (seatType === "SHARED_SLEEPER") return "border-fuchsia-300 bg-fuchsia-100 text-fuchsia-800";
  if (seatType === "SLEEPER") return "border-violet-300 bg-violet-100 text-violet-800";
  return "border-emerald-300 bg-emerald-100 text-emerald-800";
};

const EDIT_MODES = {
  SELECT_MODE: "SELECT_MODE",
  ADD_MODE: "ADD_MODE",
  REMOVE_MODE: "REMOVE_MODE",
};

const MODE_BUTTONS = [
  { value: EDIT_MODES.SELECT_MODE, label: "Select" },
  { value: EDIT_MODES.ADD_MODE, label: "Add Seat" },
  { value: EDIT_MODES.REMOVE_MODE, label: "Remove Seat" },
];

const REDUCER_ACTIONS = {
  RESET_STATE: "RESET_STATE",
  SET_MODE: "SET_MODE",
  SET_FORM_FIELD: "SET_FORM_FIELD",
  TOGGLE_BUS_TYPE: "TOGGLE_BUS_TYPE",
  SET_TEMPLATE_ID: "SET_TEMPLATE_ID",
  APPLY_TEMPLATE: "APPLY_TEMPLATE",
  SET_DEFAULT_SEAT_TYPE: "SET_DEFAULT_SEAT_TYPE",
  SET_DEFAULT_SEAT_PRICE: "SET_DEFAULT_SEAT_PRICE",
  APPLY_DEFAULT_SEAT_TYPE: "APPLY_DEFAULT_SEAT_TYPE",
  APPLY_DEFAULT_PRICE: "APPLY_DEFAULT_PRICE",
  UPDATE_DECK_NAME: "UPDATE_DECK_NAME",
  HANDLE_SEAT_CLICK: "HANDLE_SEAT_CLICK",
  ADD_SEAT: "ADD_SEAT",
  REMOVE_SEAT: "REMOVE_SEAT",
  UPDATE_SEAT: "UPDATE_SEAT",
  TOGGLE_AVAILABILITY: "TOGGLE_AVAILABILITY",
  SET_FEEDBACK: "SET_FEEDBACK",
  CLEAR_FEEDBACK: "CLEAR_FEEDBACK",
};

const getModeMessage = (mode) => {
  if (mode === EDIT_MODES.ADD_MODE) return "Add mode: click any empty '+ Add' cell to create a new seat.";
  if (mode === EDIT_MODES.REMOVE_MODE) return "Remove mode: click any seat to delete it.";
  return "Select mode: click a seat to edit it; click the same seat again to toggle availability.";
};

const createBusModalState = (bus) => {
  const initialForm = getInitialForm(bus);
  const inferredTemplate = inferTemplateFromBus(initialForm.busTypes, initialForm.decks.length);
  const defaultSeatType = initialForm.busTypes.some((type) => String(type || "").includes("SLEEPER")) ? "SLEEPER" : "SEATER";
  const firstSeat = initialForm.decks.find((deck) => Array.isArray(deck?.seats) && deck.seats.length > 0)?.seats?.[0];
  const initialDefaultPrice = firstSeat ? String(firstSeat.price) : String(DEFAULT_PRICE_BY_SEAT_TYPE[defaultSeatType] || 1800);

  return {
    form: initialForm,
    templateId: inferredTemplate || DEFAULT_TEMPLATE,
    defaultSeatType,
    defaultSeatPrice: initialDefaultPrice,
    activeSeatKey: "",
    interactionMode: EDIT_MODES.SELECT_MODE,
    formError: "",
    formInfo: "",
  };
};

const normalizeDeckSeatsForReducer = (deck, deckIndex) =>
  deckGridSeats(deck, deckIndex).map(({ key, seatIndex, ...seat }) => ({
    ...seat,
    row: toSafePositiveInt(seat.row),
    column: toSafePositiveInt(seat.column),
  }));

const generateUniqueSeatNumber = (decks) => {
  const taken = new Set();
  (Array.isArray(decks) ? decks : []).forEach((deck) => {
    (Array.isArray(deck?.seats) ? deck.seats : []).forEach((seat) => {
      const label = normalizeSeatLabel(seat?.seatNumber);
      if (label) taken.add(label);
    });
  });

  let index = 1;
  while (taken.has(`S${index}`)) index += 1;
  return `S${index}`;
};

const busModalReducer = (state, action) => {
  switch (action.type) {
    case REDUCER_ACTIONS.RESET_STATE:
      return action.payload || state;

    case REDUCER_ACTIONS.SET_MODE: {
      const nextMode = MODE_BUTTONS.some((item) => item.value === action.payload)
        ? action.payload
        : EDIT_MODES.SELECT_MODE;
      return {
        ...state,
        interactionMode: nextMode,
        activeSeatKey: nextMode === EDIT_MODES.SELECT_MODE ? state.activeSeatKey : "",
        formError: "",
        formInfo: getModeMessage(nextMode),
      };
    }

    case REDUCER_ACTIONS.CLEAR_FEEDBACK:
      return { ...state, formError: "", formInfo: "" };

    case REDUCER_ACTIONS.SET_FEEDBACK: {
      const feedback = action.payload || {};
      return {
        ...state,
        formError: String(feedback.error || ""),
        formInfo: String(feedback.info || ""),
      };
    }

    case REDUCER_ACTIONS.SET_FORM_FIELD: {
      const { field, value } = action.payload || {};
      if (!field) return state;
      return {
        ...state,
        form: {
          ...state.form,
          [field]: value,
        },
      };
    }

    case REDUCER_ACTIONS.TOGGLE_BUS_TYPE: {
      const typeValue = String(action.payload || "").trim().toUpperCase();
      if (!typeValue) return state;

      const current = normalizeBusTypes(state.form.busTypes);
      const exists = current.includes(typeValue);
      const next = exists ? current.filter((item) => item !== typeValue) : [...current, typeValue];
      return {
        ...state,
        form: {
          ...state.form,
          busTypes: next,
        },
        formError: "",
      };
    }

    case REDUCER_ACTIONS.SET_TEMPLATE_ID:
      return {
        ...state,
        templateId: String(action.payload || DEFAULT_TEMPLATE),
      };

    case REDUCER_ACTIONS.APPLY_TEMPLATE: {
      const { templateId, generated } = action.payload || {};
      if (!generated) return state;
      const templateLabel = TEMPLATE_OPTIONS.find((item) => item.value === templateId)?.label || "Template";
      return {
        ...state,
        templateId,
        form: {
          ...state.form,
          busTypes: normalizeBusTypes(generated.busTypes),
          decks: Array.isArray(generated.decks) ? generated.decks : [],
        },
        defaultSeatType: normalizeSeatType(generated.defaultSeatType),
        defaultSeatPrice: String(toSafePrice(generated.defaultPrice, 0)),
        activeSeatKey: "",
        interactionMode: EDIT_MODES.SELECT_MODE,
        formError: "",
        formInfo: `${templateLabel} applied.`,
      };
    }

    case REDUCER_ACTIONS.SET_DEFAULT_SEAT_TYPE:
      return {
        ...state,
        defaultSeatType: normalizeSeatType(action.payload),
      };

    case REDUCER_ACTIONS.SET_DEFAULT_SEAT_PRICE:
      return {
        ...state,
        defaultSeatPrice: String(action.payload ?? ""),
      };

    case REDUCER_ACTIONS.APPLY_DEFAULT_SEAT_TYPE: {
      const nextType = normalizeSeatType(state.defaultSeatType);
      const decks = (Array.isArray(state.form.decks) ? state.form.decks : []).map((deck) => {
        const sourceSeats = Array.isArray(deck?.seats) ? deck.seats : [];
        const seats = sourceSeats.map((seat) => (normalizeSeatType(seat?.seatType) === nextType ? seat : { ...seat, seatType: nextType }));
        const changed = seats.some((seat, idx) => seat !== sourceSeats[idx]);
        return changed ? { ...deck, seats } : deck;
      });

      return {
        ...state,
        form: {
          ...state.form,
          decks,
        },
        formError: "",
        formInfo: `Seat type updated to ${nextType.replace(/_/g, " ").toLowerCase()} for all seats.`,
      };
    }

    case REDUCER_ACTIONS.APPLY_DEFAULT_PRICE: {
      const parsedPrice = Number(state.defaultSeatPrice);
      if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
        return {
          ...state,
          formError: "Default seat price must be a non-negative number.",
          formInfo: "",
        };
      }

      const decks = (Array.isArray(state.form.decks) ? state.form.decks : []).map((deck) => {
        const sourceSeats = Array.isArray(deck?.seats) ? deck.seats : [];
        const seats = sourceSeats.map((seat) => (toSafePrice(seat?.price, -1) === parsedPrice ? seat : { ...seat, price: parsedPrice }));
        const changed = seats.some((seat, idx) => seat !== sourceSeats[idx]);
        return changed ? { ...deck, seats } : deck;
      });

      return {
        ...state,
        form: {
          ...state.form,
          decks,
        },
        formError: "",
        formInfo: "Default price applied to all seats.",
      };
    }

    case REDUCER_ACTIONS.UPDATE_DECK_NAME: {
      const { deckIndex, name } = action.payload || {};
      if (!Number.isFinite(Number(deckIndex))) return state;

      const decks = Array.isArray(state.form.decks) ? [...state.form.decks] : [];
      const deck = decks[deckIndex];
      if (!deck) return state;

      decks[deckIndex] = {
        ...deck,
        name,
      };

      return {
        ...state,
        form: {
          ...state.form,
          decks,
        },
      };
    }

    case REDUCER_ACTIONS.TOGGLE_AVAILABILITY: {
      const { deckIndex, seatIndex } = action.payload || {};
      if (!Number.isFinite(Number(deckIndex)) || !Number.isFinite(Number(seatIndex))) return state;

      const decks = Array.isArray(state.form.decks) ? [...state.form.decks] : [];
      const deck = decks[deckIndex];
      if (!deck) return state;

      const seats = Array.isArray(deck?.seats) ? [...deck.seats] : [];
      const seat = seats[seatIndex];
      if (!seat) return state;

      seats[seatIndex] = {
        ...seat,
        isAvailable: seat.isAvailable === false,
      };

      decks[deckIndex] = {
        ...deck,
        seats,
      };

      return {
        ...state,
        form: {
          ...state.form,
          decks,
        },
        formError: "",
        formInfo: "Seat availability toggled.",
      };
    }

    case REDUCER_ACTIONS.UPDATE_SEAT: {
      const { deckIndex, seatIndex, field, value } = action.payload || {};
      if (!Number.isFinite(Number(deckIndex)) || !Number.isFinite(Number(seatIndex)) || !field) return state;

      const decks = Array.isArray(state.form.decks) ? [...state.form.decks] : [];
      const deck = decks[deckIndex];
      if (!deck) return state;

      const seats = Array.isArray(deck?.seats) ? [...deck.seats] : [];
      const seat = seats[seatIndex];
      if (!seat) return state;

      const nextSeat = { ...seat };
      if (field === "seatType") {
        nextSeat.seatType = normalizeSeatType(value);
      }
      if (field === "price") {
        const parsedPrice = Number(value);
        if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
          return {
            ...state,
            formError: "Seat price must be a non-negative number.",
            formInfo: "",
          };
        }
        nextSeat.price = parsedPrice;
      }

      seats[seatIndex] = nextSeat;
      decks[deckIndex] = {
        ...deck,
        seats,
      };

      return {
        ...state,
        form: {
          ...state.form,
          decks,
        },
        formError: "",
      };
    }

    case REDUCER_ACTIONS.ADD_SEAT: {
      if (state.interactionMode !== EDIT_MODES.ADD_MODE) return state;

      const { deckIndex, row, column } = action.payload || {};
      const parsedDeckIndex = Number(deckIndex);
      const parsedRow = toSafePositiveInt(row);
      const parsedColumn = toSafePositiveInt(column);

      if (!Number.isFinite(parsedDeckIndex) || !parsedRow || !parsedColumn) {
        return {
          ...state,
          formError: "Invalid position selected for new seat.",
          formInfo: "",
        };
      }

      const decks = Array.isArray(state.form.decks) ? [...state.form.decks] : [];
      const deck = decks[parsedDeckIndex];
      if (!deck) return state;

      const normalizedSeats = normalizeDeckSeatsForReducer(deck, parsedDeckIndex);
      const positionConflict = normalizedSeats.some((seat) => Number(seat.row) === parsedRow && Number(seat.column) === parsedColumn);
      if (positionConflict) {
        return {
          ...state,
          formError: `Seat already exists at row ${parsedRow}, column ${parsedColumn}.`,
          formInfo: "",
        };
      }

      const seatNumber = generateUniqueSeatNumber(decks);
      const defaultSeatType = normalizeSeatType(state.defaultSeatType);
      const defaultSeatPrice = toSafePrice(
        state.defaultSeatPrice,
        DEFAULT_PRICE_BY_SEAT_TYPE[defaultSeatType] || DEFAULT_PRICE_BY_SEAT_TYPE.SEATER
      );

      const nextSeat = createSeat({
        seatNumber,
        seatType: defaultSeatType,
        price: defaultSeatPrice,
        row: parsedRow,
        column: parsedColumn,
        isAvailable: true,
      });

      const seats = [...normalizedSeats, nextSeat].sort((a, b) => {
        if (a.row !== b.row) return a.row - b.row;
        if (a.column !== b.column) return a.column - b.column;
        return sortSeatLabels(a.seatNumber, b.seatNumber);
      });

      const createdIndex = seats.findIndex((seat) => seat.seatNumber === seatNumber);

      decks[parsedDeckIndex] = {
        ...deck,
        seats,
      };

      return {
        ...state,
        form: {
          ...state.form,
          decks,
        },
        activeSeatKey: createdIndex >= 0 ? getSeatKey(parsedDeckIndex, createdIndex) : state.activeSeatKey,
        formError: "",
        formInfo: `Seat ${seatNumber} added at row ${parsedRow}, column ${parsedColumn}.`,
      };
    }

    case REDUCER_ACTIONS.REMOVE_SEAT: {
      if (state.interactionMode !== EDIT_MODES.REMOVE_MODE) return state;

      const { deckIndex, seatIndex } = action.payload || {};
      if (!Number.isFinite(Number(deckIndex)) || !Number.isFinite(Number(seatIndex))) return state;

      const decks = Array.isArray(state.form.decks) ? [...state.form.decks] : [];
      const deck = decks[deckIndex];
      if (!deck) return state;

      const seats = Array.isArray(deck?.seats) ? deck.seats : [];
      const targetSeat = seats[seatIndex];
      if (!targetSeat) return state;

      const nextSeats = seats.filter((_, idx) => idx !== seatIndex);
      decks[deckIndex] = {
        ...deck,
        seats: nextSeats,
      };

      const deletedKey = getSeatKey(deckIndex, seatIndex);
      return {
        ...state,
        form: {
          ...state.form,
          decks,
        },
        activeSeatKey: state.activeSeatKey === deletedKey ? "" : state.activeSeatKey,
        formError: "",
        formInfo: `Seat ${normalizeSeatLabel(targetSeat?.seatNumber)} removed.`,
      };
    }

    case REDUCER_ACTIONS.HANDLE_SEAT_CLICK: {
      const { deckIndex, seatIndex } = action.payload || {};
      if (!Number.isFinite(Number(deckIndex)) || !Number.isFinite(Number(seatIndex))) return state;

      if (state.interactionMode === EDIT_MODES.REMOVE_MODE) {
        return busModalReducer(state, {
          type: REDUCER_ACTIONS.REMOVE_SEAT,
          payload: { deckIndex, seatIndex },
        });
      }

      if (state.interactionMode === EDIT_MODES.ADD_MODE) {
        return {
          ...state,
          formError: "",
          formInfo: "Add mode is active. Click an empty '+ Add' cell to create a new seat.",
        };
      }

      const key = getSeatKey(deckIndex, seatIndex);
      if (state.activeSeatKey === key) {
        return busModalReducer(state, {
          type: REDUCER_ACTIONS.TOGGLE_AVAILABILITY,
          payload: { deckIndex, seatIndex },
        });
      }

      return {
        ...state,
        activeSeatKey: key,
        formError: "",
        formInfo: "Seat selected for editing.",
      };
    }

    default:
      return state;
  }
};

const SeatGridButton = memo(function SeatGridButton({ seat, deckIndex, isActive, mode, onSeatClick }) {
  const seatType = normalizeSeatType(seat?.seatType);
  const removeModeClass = mode === EDIT_MODES.REMOVE_MODE ? "ring-1 ring-rose-300 hover:ring-2 hover:ring-rose-500" : "";

  return (
    <button
      type="button"
      onClick={() => onSeatClick(deckIndex, seat.seatIndex)}
      className={`h-20 rounded-lg border px-1 py-1 text-center text-[11px] font-semibold transition ${getSeatButtonClass(
        seatType,
        seat.isAvailable !== false,
        isActive
      )} ${removeModeClass}`}
      title={`${seat.seatNumber} | ${seatType} | NPR ${seat.price}`}
    >
      <div className="flex items-center justify-center text-[10px]">
        <Armchair className="h-4 w-4" />
      </div>
      <div className="truncate text-xs font-bold">{seat.seatNumber}</div>
      <div className="text-[10px]">{seatType.toLowerCase().replace(/_/g, " ")}</div>
      <div className="text-[10px]">NPR {seat.price}</div>
    </button>
  );
});

SeatGridButton.displayName = "SeatGridButton";

const EmptyGridCell = memo(function EmptyGridCell({ deckIndex, row, column, mode, onAddSeat }) {
  const addModeActive = mode === EDIT_MODES.ADD_MODE;
  return (
    <button
      type="button"
      disabled={!addModeActive}
      onClick={() => onAddSeat(deckIndex, row, column)}
      className={`h-20 rounded-lg border border-dashed text-[11px] font-semibold transition ${
        addModeActive
          ? "cursor-pointer border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
          : "cursor-default border-slate-300 bg-slate-50 text-slate-400"
      }`}
      title={addModeActive ? `Add seat at row ${row}, column ${column}` : "Switch to Add Seat mode to add here"}
    >
      + Add
    </button>
  );
});

EmptyGridCell.displayName = "EmptyGridCell";

export default function BusModal({ open, mode = "create", bus = null, submitting = false, onClose, onSubmit }) {
  const [state, dispatch] = useReducer(busModalReducer, bus, createBusModalState);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");

  useEffect(() => {
    if (!open) return;
    dispatch({
      type: REDUCER_ACTIONS.RESET_STATE,
      payload: createBusModalState(bus),
    });
    setImageFile(null);
    setImagePreview("");
  }, [open, bus]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview("");
      return undefined;
    }

    const url = URL.createObjectURL(imageFile);
    setImagePreview(url);

    return () => {
      URL.revokeObjectURL(url);
    };
  }, [imageFile]);

  const totalSeats = useMemo(() => {
    return (Array.isArray(state.form.decks) ? state.form.decks : []).reduce(
      (sum, deck) => sum + (Array.isArray(deck?.seats) ? deck.seats.length : 0),
      0
    );
  }, [state.form.decks]);

  const activeSeat = useMemo(() => {
    const parsed = parseSeatKey(state.activeSeatKey);
    if (!parsed) return null;

    const deck = Array.isArray(state.form.decks) ? state.form.decks[parsed.deckIndex] : null;
    const seat = Array.isArray(deck?.seats) ? deck.seats[parsed.seatIndex] : null;
    if (!seat) return null;

    return {
      ...parsed,
      deck,
      seat,
      label: normalizeSeatLabel(seat.seatNumber),
    };
  }, [state.activeSeatKey, state.form.decks]);

  const closeWithGuard = useCallback(() => {
    if (submitting) return;
    onClose();
  }, [onClose, submitting]);

  const handleFormFieldChange = useCallback((field, value) => {
    dispatch({
      type: REDUCER_ACTIONS.SET_FORM_FIELD,
      payload: { field, value },
    });
  }, []);

  const handleModeChange = useCallback((nextMode) => {
    dispatch({
      type: REDUCER_ACTIONS.SET_MODE,
      payload: nextMode,
    });
  }, []);

  const handleTemplateSelection = useCallback((value) => {
    dispatch({
      type: REDUCER_ACTIONS.SET_TEMPLATE_ID,
      payload: value,
    });
  }, []);

  const handleApplyTemplate = useCallback(() => {
    const generated = generateTemplateDecks(state.templateId);
    dispatch({
      type: REDUCER_ACTIONS.APPLY_TEMPLATE,
      payload: {
        templateId: state.templateId,
        generated,
      },
    });
  }, [state.templateId]);

  const handleToggleBusType = useCallback((typeValue) => {
    dispatch({
      type: REDUCER_ACTIONS.TOGGLE_BUS_TYPE,
      payload: typeValue,
    });
  }, []);

  const handleDeckNameChange = useCallback((deckIndex, value) => {
    dispatch({
      type: REDUCER_ACTIONS.UPDATE_DECK_NAME,
      payload: { deckIndex, name: value },
    });
  }, []);

  const handleSeatClick = useCallback((deckIndex, seatIndex) => {
    dispatch({
      type: REDUCER_ACTIONS.HANDLE_SEAT_CLICK,
      payload: { deckIndex, seatIndex },
    });
  }, []);

  const handleAddSeat = useCallback((deckIndex, row, column) => {
    dispatch({
      type: REDUCER_ACTIONS.ADD_SEAT,
      payload: { deckIndex, row, column },
    });
  }, []);

  const handleRemoveSeat = useCallback((deckIndex, seatIndex) => {
    dispatch({
      type: REDUCER_ACTIONS.REMOVE_SEAT,
      payload: { deckIndex, seatIndex },
    });
  }, []);

  const updateActiveSeat = useCallback((field, value) => {
    const parsed = parseSeatKey(state.activeSeatKey);
    if (!parsed) return;

    if (field === "isAvailable") {
      dispatch({
        type: REDUCER_ACTIONS.TOGGLE_AVAILABILITY,
        payload: parsed,
      });
      return;
    }

    dispatch({
      type: REDUCER_ACTIONS.UPDATE_SEAT,
      payload: {
        ...parsed,
        field,
        value,
      },
    });
  }, [state.activeSeatKey]);

  const submitForm = (event) => {
    event.preventDefault();
    dispatch({ type: REDUCER_ACTIONS.CLEAR_FEEDBACK });

    const name = String(state.form.name || "").trim();
    const vehicleNumber = String(state.form.vehicleNumber || "").trim();
    const busPhone = String(state.form.phone || "").trim();
    const operator = String(state.form.operator || "").trim();
    const busTypes = normalizeBusTypes(state.form.busTypes);

    if (!name) {
      dispatch({ type: REDUCER_ACTIONS.SET_FEEDBACK, payload: { error: "Bus name is required." } });
      return;
    }

    if (busTypes.length === 0) {
      dispatch({ type: REDUCER_ACTIONS.SET_FEEDBACK, payload: { error: "Select at least one bus type." } });
      return;
    }

    if (new Set(busTypes).size !== busTypes.length) {
      dispatch({ type: REDUCER_ACTIONS.SET_FEEDBACK, payload: { error: "Duplicate bus types are not allowed." } });
      return;
    }

    const sourceDecks = Array.isArray(state.form.decks) ? state.form.decks : [];
    if (sourceDecks.length === 0) {
      dispatch({ type: REDUCER_ACTIONS.SET_FEEDBACK, payload: { error: "At least one deck is required." } });
      return;
    }

    const seenSeatLabels = new Set();
    const normalizedDecks = [];

    for (let deckIndex = 0; deckIndex < sourceDecks.length; deckIndex += 1) {
      const sourceDeck = sourceDecks[deckIndex] || {};
      const deckName = String(sourceDeck.name || "").trim() || (deckIndex === 0 ? "Lower Deck" : `Deck ${deckIndex + 1}`);
      const sourceSeats = normalizeDeckSeatsForReducer(sourceDeck, deckIndex);

      if (sourceSeats.length === 0) {
        dispatch({
          type: REDUCER_ACTIONS.SET_FEEDBACK,
          payload: { error: `Deck ${deckIndex + 1} must have at least one seat.` },
        });
        return;
      }

      const seatPositions = new Set();
      const seats = [];

      for (let seatIndex = 0; seatIndex < sourceSeats.length; seatIndex += 1) {
        const sourceSeat = sourceSeats[seatIndex] || {};
        const seatLabel = normalizeSeatLabel(sourceSeat.seatNumber);
        if (!seatLabel) {
          dispatch({
            type: REDUCER_ACTIONS.SET_FEEDBACK,
            payload: { error: `Seat label is missing at deck ${deckIndex + 1}, seat ${seatIndex + 1}.` },
          });
          return;
        }

        if (seenSeatLabels.has(seatLabel)) {
          dispatch({
            type: REDUCER_ACTIONS.SET_FEEDBACK,
            payload: { error: `Duplicate seat label detected: ${seatLabel}` },
          });
          return;
        }
        seenSeatLabels.add(seatLabel);

        const seatType = normalizeSeatType(sourceSeat.seatType);
        if (!SEAT_TYPE_SET.has(seatType)) {
          dispatch({
            type: REDUCER_ACTIONS.SET_FEEDBACK,
            payload: { error: `Invalid seat type for ${seatLabel}.` },
          });
          return;
        }

        const price = Number(sourceSeat.price);
        if (!Number.isFinite(price) || price < 0) {
          dispatch({
            type: REDUCER_ACTIONS.SET_FEEDBACK,
            payload: { error: `Seat price must be non-negative for ${seatLabel}.` },
          });
          return;
        }

        const row = Number(sourceSeat.row);
        const column = Number(sourceSeat.column);
        if (!Number.isFinite(row) || row <= 0 || !Number.isFinite(column) || column <= 0) {
          dispatch({
            type: REDUCER_ACTIONS.SET_FEEDBACK,
            payload: { error: `Seat ${seatLabel} must have valid row and column values.` },
          });
          return;
        }

        const positionKey = `${Math.trunc(row)}:${Math.trunc(column)}`;
        if (seatPositions.has(positionKey)) {
          dispatch({
            type: REDUCER_ACTIONS.SET_FEEDBACK,
            payload: { error: `Overlapping seats found at row ${Math.trunc(row)}, column ${Math.trunc(column)} on deck ${deckIndex + 1}.` },
          });
          return;
        }
        seatPositions.add(positionKey);

        seats.push({
          seatNumber: seatLabel,
          seatType,
          price,
          isAvailable: sourceSeat.isAvailable !== false,
          row: Math.trunc(row),
          column: Math.trunc(column),
        });
      }

      normalizedDecks.push({
        deckNumber: deckIndex + 1,
        name: deckName,
        seats,
      });
    }

    const payload = new FormData();
    payload.append("name", name);
    payload.append("busTypes", JSON.stringify(busTypes));
    payload.append("busCategory", deriveBusCategoryFromBusTypes(busTypes));
    payload.append("totalSeats", String(seenSeatLabels.size));
    payload.append("decks", JSON.stringify(normalizedDecks));

    if (vehicleNumber) payload.append("vehicleNumber", vehicleNumber);
    else if (mode === "edit") payload.append("vehicleNumber", "");

    if (busPhone) payload.append("phone", busPhone);
    else if (mode === "edit") payload.append("phone", "");

    if (operator) payload.append("operator", operator);
    else if (mode === "edit") payload.append("operator", "");

    payload.append("refundPolicy", String(state.form.refundPolicy || "").trim());
    payload.append("cancellationPolicy", String(state.form.cancellationPolicy || "").trim());
    payload.append("dateChangePolicy", String(state.form.dateChangePolicy || "").trim());
    payload.append("luggagePolicy", String(state.form.luggagePolicy || "").trim());

    if (imageFile) payload.append("image", imageFile);

    onSubmit(payload);
  };

  const activeImage = imagePreview || toAbsoluteAssetUrl(bus?.imageUrl);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/50 px-4">
      <div className="max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-700">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {mode === "edit" ? "Edit Bus Layout" : "Create Bus Layout"}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Nepal-ready templates, multi bus types, and click-based seat management.
            </p>
          </div>
          <button
            type="button"
            onClick={closeWithGuard}
            disabled={submitting}
            className="grid h-9 w-9 place-items-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            aria-label="Close bus modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submitForm} className="space-y-5 px-5 py-5">
          {state.formError ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700">{state.formError}</div>
          ) : null}

          {state.formInfo ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{state.formInfo}</div>
          ) : null}

          <section className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 dark:border-slate-700 dark:bg-slate-800/50">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Bus Name</label>
              <input
                value={state.form.name}
                onChange={(event) => handleFormFieldChange("name", event.target.value)}
                required
                className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Vehicle Number</label>
              <input
                value={state.form.vehicleNumber}
                onChange={(event) => handleFormFieldChange("vehicleNumber", event.target.value)}
                placeholder="Optional"
                className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Bus Phone</label>
              <input
                value={state.form.phone}
                onChange={(event) => handleFormFieldChange("phone", event.target.value)}
                placeholder="Optional"
                className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Operator ID</label>
              <input
                value={state.form.operator}
                onChange={(event) => handleFormFieldChange("operator", event.target.value)}
                placeholder="Optional"
                className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-blue-200 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Total Seats</label>
              <input
                value={String(totalSeats)}
                readOnly
                className="mt-1 h-10 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm font-semibold text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Bus Types (multi-select)</label>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {BUS_TYPE_OPTIONS.map((option) => {
                  const checked = normalizeBusTypes(state.form.busTypes).includes(option.value);
                  return (
                    <label
                      key={option.value}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium ${
                        checked
                          ? "border-blue-300 bg-blue-50 text-blue-800"
                          : "border-slate-200 bg-white text-slate-700"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleToggleBusType(option.value)}
                        className="h-4 w-4"
                      />
                      {option.label}
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-slate-500">At least one bus type is required. Duplicate values are not allowed.</p>

              <div className="mt-2 flex flex-wrap gap-2">
                {normalizeBusTypes(state.form.busTypes).map((type) => (
                  <span key={type} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${getTypeBadgeClass(type)}`}>
                    {type.replace(/_/g, " ")}
                  </span>
                ))}
              </div>
            </div>
          </section>

          <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900 lg:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <Wand2 className="h-4 w-4 text-blue-600" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Seat Templates</h4>
              </div>
              <select
                value={state.templateId}
                onChange={(event) => handleTemplateSelection(event.target.value)}
                className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {TEMPLATE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleApplyTemplate}
                className="mt-2 inline-flex h-9 items-center gap-2 rounded-lg bg-blue-600 px-3 text-xs font-semibold text-white hover:bg-blue-700"
              >
                <Wand2 className="h-3.5 w-3.5" />
                Apply Template
              </button>
            </div>

            <div>
              <div className="mb-2 flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-blue-600" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Bulk Defaults</h4>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">Default Seat Type</label>
                  <select
                    value={state.defaultSeatType}
                    onChange={(event) =>
                      dispatch({
                        type: REDUCER_ACTIONS.SET_DEFAULT_SEAT_TYPE,
                        payload: event.target.value,
                      })
                    }
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    {SEAT_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => dispatch({ type: REDUCER_ACTIONS.APPLY_DEFAULT_SEAT_TYPE })}
                    className="mt-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Apply Type to All Seats
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">Default Price (NPR)</label>
                  <input
                    type="number"
                    min={0}
                    value={state.defaultSeatPrice}
                    onChange={(event) =>
                      dispatch({
                        type: REDUCER_ACTIONS.SET_DEFAULT_SEAT_PRICE,
                        payload: event.target.value,
                      })
                    }
                    className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  />
                  <button
                    type="button"
                    onClick={() => dispatch({ type: REDUCER_ACTIONS.APPLY_DEFAULT_PRICE })}
                    className="mt-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                  >
                    Apply Price to All Seats
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Grid3X3 className="h-4 w-4 text-blue-600" />
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Visual Seat Layout</h4>
              </div>
              <p className="text-xs text-slate-500">{getModeMessage(state.interactionMode)}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {MODE_BUTTONS.map((item) => {
                const active = state.interactionMode === item.value;
                return (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => handleModeChange(item.value)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                      active
                        ? "border-blue-300 bg-blue-100 text-blue-800"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>

            {activeSeat ? (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-blue-700">Selected Seat: {activeSeat.label}</p>
                  <button
                    type="button"
                    onClick={() => handleModeChange(EDIT_MODES.SELECT_MODE)}
                    className="rounded-lg border border-blue-200 bg-white px-2 py-1 text-[11px] font-semibold text-blue-700"
                  >
                    Edit Mode
                  </button>
                </div>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <select
                    value={activeSeat.seat.seatType}
                    onChange={(event) => updateActiveSeat("seatType", event.target.value)}
                    className="h-9 rounded-lg border border-blue-200 bg-white px-2 text-xs text-slate-700"
                  >
                    {SEAT_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    min={0}
                    value={activeSeat.seat.price}
                    onChange={(event) => updateActiveSeat("price", event.target.value)}
                    className="h-9 rounded-lg border border-blue-200 bg-white px-2 text-xs text-slate-700"
                  />
                  <button
                    type="button"
                    onClick={() => updateActiveSeat("isAvailable", true)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      activeSeat.seat.isAvailable === false
                        ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border border-rose-200 bg-rose-50 text-rose-700"
                    }`}
                  >
                    {activeSeat.seat.isAvailable === false ? "Mark Enabled" : "Mark Disabled"}
                  </button>
                </div>
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => handleRemoveSeat(activeSeat.deckIndex, activeSeat.seatIndex)}
                    disabled={state.interactionMode !== EDIT_MODES.REMOVE_MODE}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Remove Selected Seat
                  </button>
                </div>
              </div>
            ) : null}

            {(Array.isArray(state.form.decks) ? state.form.decks : []).map((deck, deckIndex) => {
              const seats = deckGridSeats(deck, deckIndex);
              const maxColumn = Math.max(5, ...seats.map((seat) => seat.column));
              const maxRow = Math.max(1, ...seats.map((seat) => seat.row));
              const renderRows = maxRow + 1;
              const seatByPosition = new Map(seats.map((seat) => [`${seat.row}:${seat.column}`, seat]));

              return (
                <div key={`deck-${deckIndex}`} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
                  <div className="mb-3 flex items-center gap-2">
                    <Layers className="h-4 w-4 text-slate-500" />
                    <input
                      value={deck.name}
                      onChange={(event) => handleDeckNameChange(deckIndex, event.target.value)}
                      className="h-9 w-full max-w-xs rounded-lg border border-slate-200 bg-white px-2 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    />
                  </div>

                  <div className="overflow-auto rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                    <div
                      className="grid gap-2"
                      style={{
                        gridTemplateColumns: `repeat(${maxColumn}, minmax(64px, 1fr))`,
                        minWidth: `${maxColumn * 72}px`,
                      }}
                    >
                      {Array.from({ length: renderRows * maxColumn }).map((_, index) => {
                        const row = Math.floor(index / maxColumn) + 1;
                        const column = (index % maxColumn) + 1;
                        const seat = seatByPosition.get(`${row}:${column}`);

                        if (seat) {
                          return (
                            <SeatGridButton
                              key={seat.key}
                              seat={seat}
                              deckIndex={deckIndex}
                              isActive={state.activeSeatKey === seat.key}
                              mode={state.interactionMode}
                              onSeatClick={handleSeatClick}
                            />
                          );
                        }

                        return (
                          <EmptyGridCell
                            key={`blank-${deckIndex}-${row}-${column}`}
                            deckIndex={deckIndex}
                            row={row}
                            column={column}
                            mode={state.interactionMode}
                            onAddSeat={handleAddSeat}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="sm:col-span-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">Refund Policy</label>
                <textarea
                  rows={2}
                  value={state.form.refundPolicy}
                  onChange={(event) => handleFormFieldChange("refundPolicy", event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">Cancellation Policy</label>
                <textarea
                  rows={2}
                  value={state.form.cancellationPolicy}
                  onChange={(event) => handleFormFieldChange("cancellationPolicy", event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">Date Change Policy</label>
                <textarea
                  rows={2}
                  value={state.form.dateChangePolicy}
                  onChange={(event) => handleFormFieldChange("dateChangePolicy", event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">Luggage Policy</label>
                <textarea
                  rows={2}
                  value={state.form.luggagePolicy}
                  onChange={(event) => handleFormFieldChange("luggagePolicy", event.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Bus Image</label>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => setImageFile(event.target.files?.[0] || null)}
                className="mt-1 block w-full text-xs text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-200 file:px-3 file:py-1.5 file:font-semibold file:text-slate-700 hover:file:bg-slate-300 dark:text-slate-300 dark:file:bg-slate-700 dark:file:text-slate-200"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">Preview</label>
              {activeImage ? (
                <img src={activeImage} alt="Bus preview" className="mt-1 h-28 w-full rounded-lg object-cover" />
              ) : (
                <div className="mt-1 grid h-28 place-items-center rounded-lg border border-dashed border-slate-300 text-xs text-slate-500 dark:border-slate-600 dark:text-slate-400">
                  No image selected
                </div>
              )}
            </div>
          </section>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={closeWithGuard}
              disabled={submitting}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {submitting ? "Saving..." : mode === "edit" ? "Update Bus" : "Create Bus"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
