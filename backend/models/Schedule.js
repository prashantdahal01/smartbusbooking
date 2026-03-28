// MongoDB schema for schedules linking a bus to a route at a specific date/time
const mongoose = require("mongoose");

const ScheduleSchema = new mongoose.Schema(
  {
    bus: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Bus",           // Reference to the bus
    },
    route: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Route",         // Reference to the route
    },
    departureTime: Date,    // Scheduled departure date and time
    arrivalTime: Date,      // Scheduled arrival date and time
    fare: Number,           // Base ticket fare for this schedule
    availableSeats: Number, // Number of currently available seats
    status: String,         // e.g., scheduled, departed, cancelled
  },
  { timestamps: true }
);

module.exports = mongoose.model("Schedule", ScheduleSchema);
