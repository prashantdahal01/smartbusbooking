const mongoose = require("mongoose");
const { City } = require("../location/location.model");
const { Stop } = require("../stop/stop.model");
const { Schedule } = require("../schedule/schedule.model");
const { Booking } = require("../booking/booking.model");

const routePointSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true },
    time: { type: String, trim: true },
    order: { type: Number },
  },
  { _id: false }
);

const routeSchema = new mongoose.Schema(
  {
    sourceCity: { type: mongoose.Schema.Types.ObjectId, ref: "City", required: true, index: true },
    destinationCity: { type: mongoose.Schema.Types.ObjectId, ref: "City", required: true, index: true },
    sourceDistrict: { type: String, required: true, trim: true },
    destinationDistrict: { type: String, required: true, trim: true },

    // Compatibility fields used in schedule search and legacy UI.
    source: { type: String, required: true, trim: true },
    destination: { type: String, required: true, trim: true },

    distance: { type: Number, required: true, min: 1 },

    boardingPoints: {
      type: [routePointSchema],
      default: [],
    },

    droppingPoints: {
      type: [routePointSchema],
      default: [],
    },

    // Legacy list retained for backward compatibility and migration fallback.
    stops: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
  },
  { timestamps: true }
);

routeSchema.index({ sourceCity: 1, destinationCity: 1 }, { unique: true });

const Route = mongoose.model("Route", routeSchema);
module.exports = { Route, City, Stop, Schedule, Booking };