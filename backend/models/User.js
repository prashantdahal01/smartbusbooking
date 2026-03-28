// MongoDB schema for users with role field: 'admin', 'customer', or 'operator'
const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: String,           // Full name of the user
    email: String,          // Unique email address
    password: String,       // Hashed password
    role: {
      type: String,
      enum: ["admin", "customer", "operator"], // Roles for access control
      default: "customer",
    },
    phone: String,          // Contact number
    isActive: Boolean,      // Account status flag
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", UserSchema);
