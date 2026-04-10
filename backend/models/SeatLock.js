const mongoose = require("mongoose");

const seatLockSchema = new mongoose.Schema({
  seatNumber: Number,
  schedule: { type: mongoose.Schema.Types.ObjectId, ref: "Schedule" },
  lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  lockedAt: {
    type: Date,
    default: Date.now,
    expires: 600
  }
});

seatLockSchema.index({ schedule: 1, seatNumber: 1 }, { unique: true });

module.exports = mongoose.model("SeatLock", seatLockSchema);