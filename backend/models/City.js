const mongoose = require("mongoose");

const normalizeKey = (value) => String(value || "").trim().toLowerCase();

const citySchema = new mongoose.Schema(
	{
		name: { type: String, required: true, trim: true },
		key: { type: String, required: true, trim: true, lowercase: true, unique: true, index: true },
		district: { type: mongoose.Schema.Types.ObjectId, ref: "District", required: true, index: true },
	},
	{ timestamps: true }
);

citySchema.pre("validate", function deriveCityKey(next) {
	if (this.name) {
		this.key = normalizeKey(this.name);
	}
	next();
});

module.exports = mongoose.model("City", citySchema);