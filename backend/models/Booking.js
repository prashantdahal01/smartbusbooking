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

const paymentSchema = new mongoose.Schema(
  {
    provider: { type: String, enum: ["esewa"], default: "esewa" },
    status: { type: String, enum: ["initiated", "paid", "failed"], default: "initiated" },
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
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  schedule: { type: mongoose.Schema.Types.ObjectId, ref: "Schedule" },
  passenger: passengerSchema,
  boardingPoint: stopPointSchema,
  droppingPoint: stopPointSchema,
  seats: [Number],
  pricePerSeat: Number,
  totalPrice: Number,
  status: { type: String, enum: ["payment_pending", "confirmed", "cancelled", "payment_failed"], default: "confirmed" },
  payment: paymentSchema
  },
  { timestamps: true }
);

module.exports = mongoose.model("Booking", bookingSchema);