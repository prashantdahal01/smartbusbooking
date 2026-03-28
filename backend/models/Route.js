// MongoDB schema for routes defining source, destination, stops, and distance
const mongoose = require("mongoose");

const RouteSchema = new mongoose.Schema(
  {
    routeName: String,      // Human-readable route name
    source: String,         // Starting location
    destination: String,    // Ending location
    stops: [String],        // Intermediate stops along the route
    distance: Number,       // Total distance in kilometers
    estimatedDuration: Number, // Estimated travel time in minutes
  },
  { timestamps: true }
);

module.exports = mongoose.model("Route", RouteSchema);
