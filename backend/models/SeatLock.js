// MongoDB schema for temporarily locking seats during the booking process
const mongoose = require("mongoose");

const SeatLockSchema = new mongoose.Schema(
  {
    schedule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Schedule",      // The schedule the seat belongs to
    },
    seat: String,           // Seat number being locked
    lockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",          // The user holding the lock
    },
    expiresAt: Date,        // Lock expiry time (auto-release after timeout)
  },
  { timestamps: true }
);

module.exports = mongoose.model("SeatLock", SeatLockSchema);
