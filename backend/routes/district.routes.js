const express = require("express");
const router = express.Router();

const districtController = require("../controllers/district.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");

// POST /api/districts (admin)
router.post("/", verifyToken, authorizeRoles("admin"), districtController.createDistrictWithCities);

// PUT /api/districts/:id (admin)
router.put("/:id", verifyToken, authorizeRoles("admin"), districtController.updateDistrict);

// DELETE /api/districts/:id (admin)
router.delete("/:id", verifyToken, authorizeRoles("admin"), districtController.deleteDistrict);

// POST /api/districts/:id/cities (admin)
router.post("/:id/cities", verifyToken, authorizeRoles("admin"), districtController.addCityToDistrict);

// PUT /api/districts/:districtId/cities/:cityId (admin)
router.put("/:districtId/cities/:cityId", verifyToken, authorizeRoles("admin"), districtController.updateCity);

// DELETE /api/districts/:districtId/cities/:cityId (admin)
router.delete("/:districtId/cities/:cityId", verifyToken, authorizeRoles("admin"), districtController.deleteCity);

// GET /api/districts
router.get("/", districtController.getDistricts);

module.exports = router;
