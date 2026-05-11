const express = require("express");
const router = express.Router();

const districtController = require("./district.controller");
const { verifyToken } = require("../../middleware/auth.middleware");
const { authorizeRoles } = require("../../middleware/role.middleware");

router.post("/", verifyToken, authorizeRoles("admin"), districtController.createDistrictWithCities);
router.put("/:id", verifyToken, authorizeRoles("admin"), districtController.updateDistrict);
router.delete("/:id", verifyToken, authorizeRoles("admin"), districtController.deleteDistrict);
router.post("/:id/cities", verifyToken, authorizeRoles("admin"), districtController.addCityToDistrict);
router.put("/:districtId/cities/:cityId", verifyToken, authorizeRoles("admin"), districtController.updateCity);
router.delete("/:districtId/cities/:cityId", verifyToken, authorizeRoles("admin"), districtController.deleteCity);
router.get("/", districtController.getDistricts);

module.exports = router;
