// API routes for user profile management (authenticated users only)
const express = require("express");
const router = express.Router();
const { getProfile, updateProfile } = require("../controllers/user.controller");
const { verifyToken } = require("../middleware/auth.middleware");

// GET  /api/users/profile  – Get current user's profile
// PUT  /api/users/profile  – Update current user's profile

router.use(verifyToken);
router.get("/profile", getProfile);
router.put("/profile", updateProfile);

module.exports = router;
