const express = require("express");
const router = express.Router();
const { register, login, me, forgotPassword, resetPassword } = require("./auth.controller");
const { verifyToken } = require("../../middleware/auth.middleware");

router.post("/register", register);
router.post("/login", login);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.get("/me", verifyToken, me);

module.exports = router;
