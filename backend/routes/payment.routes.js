// API routes for payment initiation and callbacks (eSewa)
const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/payment.controller");
const { verifyToken } = require("../middleware/auth.middleware");

// Initiate eSewa payment (requires logged-in user)
router.post("/esewa/initiate", verifyToken, paymentController.initiateEsewaPayment);
router.post("/esewa/retry", verifyToken, paymentController.retryEsewaPayment);
router.post("/esewa/verify", verifyToken, paymentController.verifyEsewaPayment);
router.get("/esewa/debug/:bookingId", verifyToken, paymentController.debugEsewaPayment);

// eSewa redirects the user back to these URLs (no auth header available)
router.get("/esewa/success", paymentController.handleEsewaSuccess);
router.get("/esewa/failure", paymentController.handleEsewaFailure);

module.exports = router;
