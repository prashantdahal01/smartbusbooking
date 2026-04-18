const mongoose = require("mongoose");

const stopSchema = new mongoose.Schema(
	{
		route: { type: mongoose.Schema.Types.ObjectId, ref: "Route", required: true, index: true },
		// Can store a City ObjectId or plain city name for compatibility use-cases.
		city: { type: mongoose.Schema.Types.Mixed, required: true },
		cityRef: { type: mongoose.Schema.Types.ObjectId, ref: "City", default: null, index: true },
		cityName: { type: String, required: true, trim: true },
		cityKey: { type: String, required: true, trim: true, lowercase: true, index: true },
		district: { type: String, required: true, trim: true },
		districtKey: { type: String, required: true, trim: true, lowercase: true, index: true },
		type: { type: String, enum: ["pickup", "drop", "both"], required: true },
		offsetMinutes: { type: Number, default: null, min: 0 },
		absoluteTime: {
			type: String,
			default: "",
			validate: {
				validator: (v) => !v || /^\d{2}:\d{2}$/.test(String(v)),
				message: "absoluteTime must be HH:mm",
			},
		},
		order: { type: Number, default: 0, index: true },
	},
	{ timestamps: true }
);

stopSchema.pre("validate", function normalizeStopKeys(next) {
	if (!this.cityName && typeof this.city === "string") {
		this.cityName = String(this.city).trim();
	}
	if (!this.cityKey && this.cityName) {
		this.cityKey = String(this.cityName).trim().toLowerCase();
	}
	if (!this.districtKey && this.district) {
		this.districtKey = String(this.district).trim().toLowerCase();
	}
	next();
});

stopSchema.index({ route: 1, cityKey: 1 }, { unique: true });

module.exports = mongoose.model("Stop", stopSchema);
