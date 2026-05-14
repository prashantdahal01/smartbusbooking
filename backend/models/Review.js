const mongoose = require("mongoose");
const { Bus } = require("../modules/bus/bus.model");
const { computeWeightedScore, computeGlobalAverage } = require("../algorithms/recommendation/bayesianScore");

const reviewSchema = new mongoose.Schema({
  bookingId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Booking",
    required: true,
    unique: true,
  },
  busId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Bus",
    required: true,
    index: true,
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true,
  },
  rating: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
  },
  comment: {
    type: String,
    trim: true,
    maxlength: 500,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

reviewSchema.index({ bookingId: 1 }, { unique: true });
reviewSchema.index({ busId: 1 });
reviewSchema.index({ userId: 1 });

const roundToTwo = (value) => Number(Number(value || 0).toFixed(2));

reviewSchema.post("save", async function updateBusRatings(doc) {
  try {
    const busId = doc?.busId;
    if (!busId) return;

    const reviewModel = this.constructor;
    const stats = await reviewModel.aggregate([
      { $match: { busId } },
      { $group: { _id: "$busId", avgRating: { $avg: "$rating" }, reviewCount: { $sum: 1 } } },
    ]);

    const avgRating = roundToTwo(stats?.[0]?.avgRating || 0);
    const reviewCount = Number(stats?.[0]?.reviewCount || 0);

    await Bus.findByIdAndUpdate(busId, { avgRating, reviewCount });

    const globalAvg = await computeGlobalAverage();
    const weightedScore = roundToTwo(computeWeightedScore(avgRating, reviewCount, globalAvg, 10));

    await Bus.findByIdAndUpdate(busId, {
      avgRating,
      reviewCount,
      weightedScore,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to update bus rating aggregates", error);
  }
});

const Review = mongoose.model("Review", reviewSchema);
module.exports = { Review };
