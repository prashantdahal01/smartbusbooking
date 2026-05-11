const mongoose = require("mongoose");
const { City } = require("../location/location.model");
const { Route } = require("../route/route.model");
const { Stop } = require("../stop/stop.model");

const normalizeKey = (value) => String(value || "").trim().toLowerCase();

const districtSchema = new mongoose.Schema(
	{
		name: { type: String, required: true, trim: true },
		key: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
	},
	{ timestamps: true }
);

districtSchema.pre("validate", function deriveDistrictKey(next) {
	if (this.name) {
		this.key = normalizeKey(this.name);
	}
	next();
});

districtSchema.index({ name: 1 }, { unique: true });

const District = mongoose.model("District", districtSchema);
module.exports = { District, City, Route, Stop };
