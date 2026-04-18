const express = require("express");

const locationController = require("../controllers/location.controller");

const router = express.Router();

router.get("/search", locationController.searchLocations);

module.exports = router;
