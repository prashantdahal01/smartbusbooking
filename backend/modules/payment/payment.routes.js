const express = require("express");
const router = express.Router();
const paymentController = require("./payment.controller");
const { verifyToken } = require("../../middleware/auth.middleware");

router.post("/esewa/initiate", verifyToken, paymentController.initiateEsewaPayment);
router.post("/esewa/retry", verifyToken, paymentController.retryEsewaPayment);
router.post("/esewa/verify", verifyToken, paymentController.verifyEsewaPayment);
router.get("/esewa/debug/:bookingId", verifyToken, paymentController.debugEsewaPayment);

router.get("/esewa/success", paymentController.handleEsewaSuccess);
router.get("/esewa/failure", paymentController.handleEsewaFailure);

module.exports = router;
