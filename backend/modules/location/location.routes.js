const express = require("express");
const router = express.Router();

const locationController = require("./location.controller");

router.get("/search", locationController.searchLocations);

module.exports = router;
