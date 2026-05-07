const express = require("express");
const router = express.Router();
const { getProfile, updateProfile } = require("./user.controller");
const { verifyToken } = require("../../middleware/auth.middleware");

router.use(verifyToken);
router.get("/profile", getProfile);
router.put("/profile", updateProfile);

module.exports = router;
