// API routes for booking management (authenticated users)
const express = require("express");
const router = express.Router();
const bookingController = require("../controllers/booking.controller");
const { verifyToken } = require("../middleware/auth.middleware");

// POST   /api/bookings           – Create a new booking
// GET    /api/bookings           – List bookings for current user
// GET    /api/bookings/:id       – Get booking details
// DELETE /api/bookings/:id       – Cancel a booking

router.use(verifyToken);

// Seat locking
router.post("/lock", bookingController.lockSeats);
router.post("/unlock", bookingController.unlockSeats);

// Bookings
router.post("/", bookingController.createBooking);
router.get("/", bookingController.getMyBookings);
router.get("/:id/ticket", bookingController.getTicketPdf);
router.get("/:id", bookingController.getBookingById);
router.delete("/:id", bookingController.cancelBooking);

module.exports = router;
