const express = require("express");
const router = express.Router();
const bookingController = require("./booking.controller");
const { verifyToken } = require("../../middleware/auth.middleware");
const { authorizeRoles } = require("../../middleware/role.middleware");

router.use(verifyToken);

router.post("/lock", bookingController.lockSeats);
router.post("/unlock", bookingController.unlockSeats);

router.post("/", bookingController.createBooking);
router.get("/", bookingController.getMyBookings);
router.get("/operator", authorizeRoles("operator"), bookingController.getOperatorBookings);
router.get("/:id/ticket", bookingController.getTicketPdf);
router.get("/:id", bookingController.getBookingById);
router.delete("/:id", authorizeRoles("admin"), bookingController.cancelBooking);

module.exports = router;
