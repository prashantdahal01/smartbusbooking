const mongoose = require("mongoose");

const pointSchema = new mongoose.Schema(
	{
		name: String,
		time: String,
		date: String,
    order: Number,
	},
	{ _id: false }
);

const policiesSchema = new mongoose.Schema(
	{
		refundPolicy: String,
		cancellationPolicy: String,
		dateChangePolicy: String,
	},
	{ _id: false }
);

const scheduleSchema = new mongoose.Schema({
  bus: { type: mongoose.Schema.Types.ObjectId, ref: "Bus" },
  route: { type: mongoose.Schema.Types.ObjectId, ref: "Route" },
  date: String,
  time: String,
  arrivalDate: String,
  arrivalTime: String,
  durationMinutes: Number,
  price: { type: Number, min: 0, default: 0 },
  isActive: { type: Boolean, default: true },

  refundable: { type: Boolean, default: false },

  // Display-only tags like: women_traveling, free_date_change, exclusive_deals, flexi_ticket
  features: { type: [String], default: [] },

  amenities: { type: [String], default: [] },

  policies: policiesSchema,

  boardingPoints: { type: [pointSchema], default: [] },
  droppingPoints: { type: [pointSchema], default: [] },
});

module.exports = mongoose.model("Schedule", scheduleSchema);