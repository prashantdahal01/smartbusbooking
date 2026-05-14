const express = require("express");
const router = express.Router();
const scheduleController = require("./schedule.controller");
const { verifyToken } = require("../../middleware/auth.middleware");
const { authorizeRoles } = require("../../middleware/role.middleware");

router.get("/route-plan", scheduleController.getDistrictRoutePlan);
router.get("/search", scheduleController.searchSchedules);
router.get("/available", scheduleController.getAvailableSchedules);
router.get("/options", scheduleController.getSearchOptions);
router.get("/operator", verifyToken, authorizeRoles("operator"), scheduleController.getOperatorSchedules);
router.post("/", verifyToken, authorizeRoles("operator"), scheduleController.createOperatorSchedule);
router.put("/:id", verifyToken, authorizeRoles("operator"), scheduleController.updateOperatorSchedule);
router.delete("/:id", verifyToken, authorizeRoles("operator"), scheduleController.deleteOperatorSchedule);
router.get("/:id/seat-status", scheduleController.getSeatStatus);

module.exports = router;
