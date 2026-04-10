const express = require("express");
const router = express.Router();

const districtController = require("../controllers/district.controller");

// GET /api/districts
router.get("/", districtController.getDistricts);

module.exports = router;
