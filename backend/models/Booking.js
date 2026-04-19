const mongoose = require("mongoose");

const passengerSchema = new mongoose.Schema(
	{
		name: String,
		age: Number,
		gender: { type: String, enum: ["male", "female", "other"] },
		phone: String,
	},
	{ _id: false }
);

const passengerDetailSchema = new mongoose.Schema(
  {
    seatLabel: String,
    name: String,
    age: Number,
    gender: { type: String, enum: ["male", "female", "other"] },
    phone: String,
    idNumber: String,
  },
  { _id: false }
);

const paymentSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ["esewa"], default: "esewa" },
    status: { type: String, enum: ["pending", "paid", "failed", "initiated"], default: "pending" },
    productCode: String,
    totalAmount: Number,
    transactionUuid: String,
    refId: String,
    gatewayStatus: String,
    paidAt: Date,
    emailSentAt: Date,
    raw: mongoose.Schema.Types.Mixed,
  },
  { _id: false }
);

const stopPointSchema = new mongoose.Schema(
  {
    name: String,
    date: String,
    time: String,
    order: Number,
  },
  { _id: false }
);

const seatPriceSchema = new mongoose.Schema(
  {
    seatLabel: { type: String, trim: true },
    deckNumber: Number,
    deckName: String,
    seatType: { type: String, enum: ["SEATER", "SLEEPER", "SHARED_SLEEPER"] },
    price: Number,
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  schedule: { type: mongoose.Schema.Types.ObjectId, ref: "Schedule" },
  passenger: passengerSchema,
  passengers: { type: [passengerDetailSchema], default: [] },
  boardingPoint: stopPointSchema,
  droppingPoint: stopPointSchema,
  seats: [String],
  seatPriceBreakdown: { type: [seatPriceSchema], default: [] },
  pricePerSeat: Number,
  totalPrice: Number,
  status: { type: String, enum: ["pending", "confirmed", "cancelled", "payment_pending", "payment_failed"], default: "pending" },
  payment: paymentSchema
  },
  { timestamps: true }
);

bookingSchema.pre("validate", function normalizeBookingSeats(next) {
  if (!Array.isArray(this.seats)) {
    this.seats = [];
    return next();
  }

  this.seats = this.seats
    .map((seat) => String(seat || "").trim().toUpperCase().replace(/\s+/g, ""))
    .filter(Boolean);

  return next();
});

module.exports = mongoose.model("Booking", bookingSchema);