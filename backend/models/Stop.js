const mongoose = require("mongoose");

const stopSchema = new mongoose.Schema(
	{
		route: { type: mongoose.Schema.Types.ObjectId, ref: "Route", required: true, index: true },
		district: { type: String, required: true, trim: true },
		districtKey: { type: String, required: true, trim: true, index: true },
		city: { type: String, required: true, trim: true },
		cityKey: { type: String, required: true, trim: true, index: true },
		type: { type: String, enum: ["pickup", "drop", "both"], required: true },
		// Primary timing model: minutes offset from the schedule departure.
		// Example: offsetMinutes=480 means 8 hours after departure.
		offsetMinutes: { type: Number, default: null },
		// Optional override: absolute time-of-day (HH:mm). Useful for fixed-time stops.
		absoluteTime: { type: String, default: "" },
		// Optional ordering hint for route sequence validation.
		order: { type: Number, default: 0 },
	},
	{ timestamps: true }
);

stopSchema.index({ route: 1, districtKey: 1, cityKey: 1 }, { unique: true });

module.exports = mongoose.model("Stop", stopSchema);
