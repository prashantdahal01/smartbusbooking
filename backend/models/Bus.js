// MongoDB schema for buses including capacity, type, and assigned operator
const mongoose = require("mongoose");

const BusSchema = new mongoose.Schema(
  {
    busNumber: String,      // Unique bus registration number
    busName: String,        // Display name of the bus
    busType: String,        // e.g., AC, Non-AC, Sleeper
    totalSeats: Number,     // Total seating capacity
    operator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",          // Reference to the operator user
    },
    amenities: [String],    // List of amenities (WiFi, charging, etc.)
    isActive: Boolean,      // Whether the bus is currently operational
  },
  { timestamps: true }
);

module.exports = mongoose.model("Bus", BusSchema);
