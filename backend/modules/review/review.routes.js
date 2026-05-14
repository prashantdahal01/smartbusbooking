const express = require("express");
const router = express.Router();
const reviewController = require("./review.controller");
const { verifyToken } = require("../../middleware/auth.middleware");

router.get("/bus/:busId", reviewController.getBusReviews);
router.get("/my", verifyToken, reviewController.getMyReviews);
router.post("/", verifyToken, reviewController.createReview);

module.exports = router;
