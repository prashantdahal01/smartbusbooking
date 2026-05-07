const express = require("express");
const router = express.Router();

router.use("/auth", require("./auth.routes"));
router.use("/users", require("../modules/user/user.routes"));
router.use("/districts", require("./district.routes"));
router.use("/routes", require("./route.routes"));
router.use("/stops", require("./stop.routes"));
router.use("/locations", require("./location.routes"));
router.use("/schedules", require("./schedule.routes"));
router.use("/operator", require("../modules/operator/operator.routes"));
router.use("/admin", require("../modules/admin/admin.routes"));

router.use("/bus", require("../modules/bus/bus.routes"));
router.use("/buses", require("../modules/bus/bus.routes"));
router.use("/booking", require("../modules/booking/booking.routes"));
router.use("/bookings", require("../modules/booking/booking.routes"));
router.use("/payment", require("../modules/payment/payment.routes"));
router.use("/payments", require("../modules/payment/payment.routes"));
router.use("/seat", require("../modules/seat/seat.routes"));
router.use("/seat-lock", require("../modules/seat/seat.routes"));

module.exports = router;
