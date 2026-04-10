const mongoose = require("mongoose");

const routeSchema = new mongoose.Schema({
  source: String,
  destination: String,
  distance: Number,

  // Ordered districts passed through for stop generation (optional).
  // Example: ["Kathmandu", "Bhaktapur", "Kavre", "Sindhuli", "Sunsari", "Morang", "Jhapa"]
  districtsCovered: { type: [String], default: [] },

  stops: {
    // Backwards compatible: historically stored as string[]
    // New format supported by the UI/API: { name: string, kmFromSource?: number }
    type: [mongoose.Schema.Types.Mixed],
    default: [],
  },
});

module.exports = mongoose.model("Route", routeSchema);