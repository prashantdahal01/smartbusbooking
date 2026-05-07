const express = require("express");
const router = express.Router();
const seatController = require("./seat.controller");
const { verifyToken } = require("../../middleware/auth.middleware");

router.get("/layout/:busId", verifyToken, seatController.getSeatLayout);
router.get("/availability", verifyToken, seatController.getSeatAvailability);

router.use(verifyToken);
router.post("/lock", seatController.lockSeats);
router.post("/validate", seatController.validateLocks);
router.post("/release", seatController.releaseLocks);

module.exports = router;
