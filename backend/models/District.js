const mongoose = require("mongoose");

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

module.exports = mongoose.model("District", districtSchema);
