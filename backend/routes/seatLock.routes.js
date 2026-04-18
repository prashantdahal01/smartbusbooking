const express = require("express");

const seatLockController = require("../controllers/seatLock.controller");
const { verifyToken } = require("../middleware/auth.middleware");

const router = express.Router();

router.use(verifyToken);

router.post("/lock", seatLockController.lock);
router.post("/validate", seatLockController.validate);
router.post("/release", seatLockController.release);

module.exports = router;
