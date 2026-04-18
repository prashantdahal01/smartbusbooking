const mongoose = require("mongoose");

let indexHealthPromise = null;

const DEFAULT_LOCK_DURATION_MS = (() => {
  const raw = Number(process.env.SEAT_LOCK_TTL_MS);
  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 5 * 60 * 1000;
})();

const normalizeSeatNumber = (value) => String(value || "").trim().toUpperCase().replace(/\s+/g, "");

const seatLockSchema = new mongoose.Schema(
  {
    scheduleId: { type: mongoose.Schema.Types.ObjectId, ref: "Schedule", required: true },
    seatNumber: { type: String, required: true, trim: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    sessionId: { type: String, required: true, trim: true },
    status: { type: String, enum: ["LOCKED"], default: "LOCKED" },
    expiresAt: { type: Date, required: true },

    // Legacy compatibility fields kept in sync by pre-validate.
    schedule: { type: mongoose.Schema.Types.ObjectId, ref: "Schedule" },
    seatLabel: { type: String, trim: true },
    lockedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    lockedAt: { type: Date },
  },
  { timestamps: true }
);

seatLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
seatLockSchema.index({ scheduleId: 1, seatNumber: 1 }, { unique: true });

seatLockSchema.pre("validate", function normalizeSeatLock(next) {
  const scheduleId = this.scheduleId || this.schedule;
  const seatNumber = normalizeSeatNumber(this.seatNumber || this.seatLabel);
  const userId = this.userId || this.lockedBy;

  if (!scheduleId) return next(new Error("scheduleId is required"));
  if (!seatNumber) return next(new Error("seatNumber is required"));
  if (!userId) return next(new Error("userId is required"));

  this.scheduleId = scheduleId;
  this.seatNumber = seatNumber;
  this.userId = userId;

  // Keep legacy keys aligned for backward compatibility in older controller logic.
  this.schedule = scheduleId;
  this.seatLabel = seatNumber;
  this.lockedBy = userId;

  const lockedAt = this.lockedAt instanceof Date ? this.lockedAt : new Date(this.lockedAt || Date.now());
  this.lockedAt = Number.isFinite(lockedAt.getTime()) ? lockedAt : new Date();

  const expiresAt = this.expiresAt instanceof Date ? this.expiresAt : new Date(this.expiresAt || 0);
  if (!Number.isFinite(expiresAt.getTime())) {
    this.expiresAt = new Date(this.lockedAt.getTime() + DEFAULT_LOCK_DURATION_MS);
  }

  const sessionId = String(this.sessionId || this.userId || "").trim();
  this.sessionId = sessionId || String(new mongoose.Types.ObjectId());
  this.status = "LOCKED";

  return next();
});

seatLockSchema.statics.ensureIndexHealth = async function ensureIndexHealth() {
  if (indexHealthPromise) return indexHealthPromise;

  indexHealthPromise = (async () => {
    const legacyIndexNames = [
      "schedule_1_seatNumber_1",
      "schedule_1_seatLabel_1",
      "seatNumber_1",
      "seatLabel_1",
    ];

    const indexes = await this.collection.indexes();
    const existingIndexNames = new Set(indexes.map((index) => index?.name).filter(Boolean));

    for (const indexName of legacyIndexNames) {
      if (!existingIndexNames.has(indexName)) continue;

      try {
        await this.collection.dropIndex(indexName);
      } catch (error) {
        const message = String(error?.message || "").toLowerCase();
        if (!message.includes("index not found") && !message.includes("ns not found")) {
          throw error;
        }
      }
    }
  })().catch((error) => {
    indexHealthPromise = null;
    throw error;
  });

  return indexHealthPromise;
};

module.exports = mongoose.model("SeatLock", seatLockSchema);