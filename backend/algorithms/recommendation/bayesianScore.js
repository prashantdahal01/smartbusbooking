const { Bus } = require("../../modules/bus/bus.model");

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const computeWeightedScore = (avgRating, reviewCount, globalAvg, minThreshold = 10) => {
  const R = toNumber(avgRating);
  const v = Math.max(0, Math.trunc(toNumber(reviewCount)));
  const C = toNumber(globalAvg);
  const m = Math.max(0, Math.trunc(toNumber(minThreshold)));

  if (v + m === 0) return 0;
  return (R * v + C * m) / (v + m);
};

const computeGlobalAverage = async () => {
  const results = await Bus.aggregate([
    {
      $group: {
        _id: null,
        totalRating: {
          $sum: {
            $multiply: [
              { $ifNull: ["$avgRating", 0] },
              { $ifNull: ["$reviewCount", 0] },
            ],
          },
        },
        totalReviews: { $sum: { $ifNull: ["$reviewCount", 0] } },
      },
    },
  ]);

  const totalReviews = toNumber(results?.[0]?.totalReviews || 0);
  const totalRating = toNumber(results?.[0]?.totalRating || 0);

  if (!Number.isFinite(totalReviews) || totalReviews <= 0) return 0;
  return totalRating / totalReviews;
};

module.exports = {
  computeWeightedScore,
  computeGlobalAverage,
};
