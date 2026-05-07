const express = require("express");
const router = express.Router();
const operatorController = require("./operator.controller");
const { verifyToken } = require("../../middleware/auth.middleware");
const { authorizeRoles } = require("../../middleware/role.middleware");

router.use(verifyToken, authorizeRoles("operator"));

router.get("/buses", operatorController.getMyBuses);
router.get("/schedules", operatorController.getMySchedules);
router.get("/passengers/:scheduleId", operatorController.getPassengers);

module.exports = router;
