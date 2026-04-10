// MongoDB schema for users with role field: 'admin', 'customer', or 'operator'
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: String,           // Full name of the user
    email: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },          // Unique email address
    password: String,       // Hashed password
    role: {
      type: String,
      enum: ["admin", "customer", "operator"], // Roles for access control
      default: "customer",
    },
    phone: String,          // Contact number
    isActive: { type: Boolean, default: true },      // Account status flag

    // Password reset (secure: store hashed token, not the raw token)
    passwordResetToken: { type: String, select: false, index: true },
    passwordResetExpires: { type: Date, select: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
