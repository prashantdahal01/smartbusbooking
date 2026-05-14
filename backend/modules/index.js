const express = require("express");
const router = express.Router();

router.use("/auth", require("./auth/auth.routes"));
router.use("/users", require("./user/user.routes"));
router.use("/districts", require("./district/district.routes"));
router.use("/routes", require("./route/route.routes"));
router.use("/stops", require("./stop/stop.routes"));
router.use("/locations", require("./location/location.routes"));
router.use("/schedules", require("./schedule/schedule.routes"));
router.use("/operator", require("./operator/operator.routes"));
router.use("/admin", require("./admin/admin.routes"));
router.use("/bus", require("./bus/bus.routes"));
router.use("/buses", require("./bus/bus.routes"));
router.use("/booking", require("./booking/booking.routes"));
router.use("/bookings", require("./booking/booking.routes"));
router.use("/payment", require("./payment/payment.routes"));
router.use("/payments", require("./payment/payment.routes"));
router.use("/seat", require("./seat/seat.routes"));
router.use("/seat-lock", require("./seatLock/seatLock.routes"));
router.use("/reviews", require("./review/review.routes"));

// Let's check if seatLock module has its own routes. If yes, mount it.
// seatLock routes were previously in routes/seatLock.routes.js
// But modules/seatLock/ doesn't have routes yet.

module.exports = router;
