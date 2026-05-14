const mongoose = require("mongoose");
const { Schedule } = require("../schedule/schedule.model");
const { User } = require("../user/user.model");

const BUS_CATEGORIES = ["AC_SLEEPER", "AC_SEATER", "NON_AC_SEATER"];
const BUS_TYPES = ["SLEEPER", "SINGLE_SLEEPER", "DOUBLE_SLEEPER", "CABIN_SLEEPER", "SINGLE_SEATER", "AC", "SOFA_SEATER"];
const SEAT_TYPES = ["SEATER", "SLEEPER", "SHARED_SLEEPER"];
const BUS_TYPE_SET = new Set(BUS_TYPES);
const SLEEPER_BUS_TYPE_SET = new Set(["SLEEPER", "SINGLE_SLEEPER", "DOUBLE_SLEEPER", "CABIN_SLEEPER"]);

const seatSchema = new mongoose.Schema(
  {
    seatNumber: { type: String, required: true, trim: true },
    seatType: { type: String, enum: SEAT_TYPES, required: true },
    price: { type: Number, required: true, min: 0 },
    isAvailable: { type: Boolean, default: true },
    row: { type: Number, min: 1 },
    column: { type: Number, min: 1 },
  },
  { _id: false }
);

const deckSchema = new mongoose.Schema(
  {
    deckNumber: { type: Number, required: true, min: 1 },
    name: { type: String, trim: true },
    seats: { type: [seatSchema], default: [] },
  },
  { _id: false }
);

const busImagesSchema = new mongoose.Schema(
  {
    bus: { type: String, trim: true },
    seatLayout: { type: String, trim: true },
    sleeperLayout: { type: String, trim: true },
  },
  { _id: false }
);

const busSchema = new mongoose.Schema({
  name: String,
  type: String,
  isActive: { type: Boolean, default: true },
  busCategory: { type: String, enum: BUS_CATEGORIES, default: "AC_SEATER" },
  busTypes: { type: [String], enum: BUS_TYPES, default: ["SINGLE_SEATER"] },
  vehicleNumber: String,
  phone: String,
  totalSeats: Number,
  avgRating: {
    type: Number,
    default: 0,
  },
  reviewCount: {
    type: Number,
    default: 0,
  },
  weightedScore: {
    type: Number,
    default: 0,
  },
  decks: { type: [deckSchema], default: [] },
  images: { type: busImagesSchema, default: () => ({}) },
  // Legacy single-image field retained for backward compatibility.
  imageUrl: String,
  policies: {
    refundPolicy: { type: String, default: "" },
    cancellationPolicy: { type: String, default: "" },
    dateChangePolicy: { type: String, default: "" },
    luggagePolicy: { type: String, default: "" },
  },
  operator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
});

const categoryToLegacyType = {
  AC_SLEEPER: "Sleeper",
  AC_SEATER: "AC",
  NON_AC_SEATER: "Non-AC",
};

const categoryToDefaultBusTypes = {
  AC_SLEEPER: ["AC", "SLEEPER"],
  AC_SEATER: ["AC", "SINGLE_SEATER"],
  NON_AC_SEATER: ["SINGLE_SEATER"],
};

const legacyTypeToCategory = {
  sleeper: "AC_SLEEPER",
  ac: "AC_SEATER",
  "non-ac": "NON_AC_SEATER",
  nonac: "NON_AC_SEATER",
};

const legacyTypeToBusTypes = {
  sleeper: ["AC", "SLEEPER"],
  ac: ["AC", "SINGLE_SEATER"],
  "non-ac": ["SINGLE_SEATER"],
  nonac: ["SINGLE_SEATER"],
};

const normalizeSeatLabel = (value) => String(value || "").trim().toUpperCase().replace(/\s+/g, "");
const normalizeBusType = (value) => String(value || "").trim().toUpperCase().replace(/[\s-]+/g, "_");
const normalizeOptionalImagePath = (value) => {
  const text = String(value || "").trim();
  return text || "";
};

const normalizeBusTypesList = (rawTypes) => {
  const seen = new Set();
  const normalized = [];

  (Array.isArray(rawTypes) ? rawTypes : []).forEach((value) => {
    const token = normalizeBusType(value);
    if (!token || seen.has(token)) return;
    seen.add(token);
    normalized.push(token);
  });

  return normalized;
};

const deriveCategoryFromBusTypes = (busTypes) => {
  const safeTypes = normalizeBusTypesList(busTypes);
  if (safeTypes.some((type) => SLEEPER_BUS_TYPE_SET.has(type))) return "AC_SLEEPER";
  if (safeTypes.includes("AC")) return "AC_SEATER";
  return "NON_AC_SEATER";
};

busSchema.pre("validate", function normalizeBusData(next) {
  const existingImages = this.images && typeof this.images === "object" ? this.images : {};
  const normalizedImages = {
    bus: normalizeOptionalImagePath(existingImages.bus),
    seatLayout: normalizeOptionalImagePath(existingImages.seatLayout),
    sleeperLayout: normalizeOptionalImagePath(existingImages.sleeperLayout),
  };

  const legacyImageUrl = normalizeOptionalImagePath(this.imageUrl);
  if (!normalizedImages.bus && legacyImageUrl) {
    normalizedImages.bus = legacyImageUrl;
  }

  this.images = normalizedImages;
  this.imageUrl = normalizedImages.bus || undefined;

  const rawBusTypes = normalizeBusTypesList(this.busTypes);

  if (rawBusTypes.length > 0) {
    const invalid = rawBusTypes.find((type) => !BUS_TYPE_SET.has(type));
    if (invalid) {
      return next(new Error(`Invalid bus type: ${invalid}`));
    }
    this.busTypes = rawBusTypes;
  } else {
    const explicitCategory = String(this.busCategory || "").trim().toUpperCase();
    if (categoryToDefaultBusTypes[explicitCategory]) {
      this.busTypes = [...categoryToDefaultBusTypes[explicitCategory]];
    } else {
      const legacyType = String(this.type || "").trim().toLowerCase().replace(/\s+/g, "-");
      this.busTypes = [...(legacyTypeToBusTypes[legacyType] || ["SINGLE_SEATER"])];
    }
  }

  this.busCategory = deriveCategoryFromBusTypes(this.busTypes);
  this.type = categoryToLegacyType[this.busCategory] || this.type || "AC";

  const decks = Array.isArray(this.decks) ? this.decks : [];
  const seenLabels = new Set();
  let seatCount = 0;

  for (const deck of decks) {
    if (!deck || typeof deck !== "object") continue;
    const seats = Array.isArray(deck.seats) ? deck.seats : [];
    for (const seat of seats) {
      if (!seat || typeof seat !== "object") continue;
      const normalized = normalizeSeatLabel(seat.seatNumber);
      if (!normalized) {
        return next(new Error("Seat label is required for each configured seat"));
      }
      if (seenLabels.has(normalized)) {
        return next(new Error(`Duplicate seat label detected: ${seat.seatNumber}`));
      }
      seenLabels.add(normalized);
      seat.seatNumber = normalized;
      seatCount += 1;
    }
  }

  if (seatCount > 0) {
    this.totalSeats = seatCount;
  }

  return next();
});

busSchema.statics.BUS_CATEGORIES = BUS_CATEGORIES;
busSchema.statics.BUS_TYPES = BUS_TYPES;
busSchema.statics.SEAT_TYPES = SEAT_TYPES;

const Bus = mongoose.model("Bus", busSchema);
module.exports = { Bus, Schedule, User };