// API routes for authentication: register, login, logout, token refresh
const express = require("express");
const router = express.Router();
const { register, login, me, forgotPassword, resetPassword } = require("../controllers/auth.controller");
const { verifyToken } = require("../middleware/auth.middleware");

// POST /api/auth/register  – Register a new user
// POST /api/auth/login     – Authenticate user and return JWT
// POST /api/auth/logout    – Invalidate user session

router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/me", verifyToken, me);

module.exports = router;
