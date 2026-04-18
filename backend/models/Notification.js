const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    targetRole: { type: String, default: "admin", index: true },
    type: {
      type: String,
      enum: ["booking", "cancellation", "system"],
      default: "system",
      index: true,
    },
    title: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    entityType: { type: String, default: "", trim: true },
    entityId: { type: mongoose.Schema.Types.Mixed, default: null },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    isRead: { type: Boolean, default: false, index: true },
  },
  { timestamps: true }
);

notificationSchema.index({ targetRole: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);
