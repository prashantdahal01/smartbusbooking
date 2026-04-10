const mongoose = require("mongoose");

const districtSchema = new mongoose.Schema(
	{
		name: { type: String, required: true, trim: true },
		cities: { type: [String], default: [] },
	},
	{ timestamps: true }
);

districtSchema.index({ name: 1 }, { unique: true });

module.exports = mongoose.model("District", districtSchema);
