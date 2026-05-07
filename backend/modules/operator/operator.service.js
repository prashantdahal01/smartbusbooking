// Handles operator-level operations: managing assigned buses and viewing passengers
const { Bus, Schedule, Booking } = require("./operator.model");

exports.getMyBuses = async (req, res) => {
  try {
    const buses = await Bus.find({ operator: req.user.id });
    return res.json(buses);
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};

exports.getMySchedules = async (req, res) => {
  try {
    const buses = await Bus.find({ operator: req.user.id }).select("_id");
    const busIds = buses.map((b) => b._id);
    const schedules = await Schedule.find({ bus: { $in: busIds } })
      .populate("bus")
      .populate("route")
      .sort({ date: 1, time: 1 });
    return res.json(schedules);
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};

exports.getPassengers = async (req, res) => {
  try {
    const scheduleId = req.params.scheduleId;
    const bookings = await Booking.find({ schedule: scheduleId, status: "confirmed" })
      .populate("user", "name email phone")
      .sort({ createdAt: -1 });
    return res.json(bookings);
  } catch (e) {
    return res.status(500).json({ message: e.message });
  }
};
