// MongoDB schema for bookings made by customers for a specific schedule
const mongoose = require("mongoose");

const BookingSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",          // The customer who made the booking
    },
    schedule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Schedule",      // The schedule being booked
    },
    seats: [String],        // List of reserved seat numbers
    totalFare: Number,      // Total amount charged for the booking
    status: String,         // e.g., confirmed, cancelled, pending
    paymentStatus: String,  // e.g., paid, unpaid, refunded
  },
  { timestamps: true }
);

module.exports = mongoose.model("Booking", BookingSchema);
