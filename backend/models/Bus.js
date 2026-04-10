const mongoose = require("mongoose");

const busSchema = new mongoose.Schema({
  name: String,
  type: String,
  vehicleNumber: String,
  totalSeats: Number,
  imageUrl: String,
  operator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }
});

module.exports = mongoose.model("Bus", busSchema);