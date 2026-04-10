// API routes for operator operations (operator role required)
const express = require("express");
const router = express.Router();
const operatorController = require("../controllers/operator.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");

// GET  /api/operator/buses             – List buses assigned to this operator
// GET  /api/operator/schedules         – List schedules for operator's buses
// GET  /api/operator/passengers/:scheduleId – View passengers for a schedule

router.use(verifyToken, authorizeRoles("operator"));

router.get("/buses", operatorController.getMyBuses);
router.get("/schedules", operatorController.getMySchedules);
router.get("/passengers/:scheduleId", operatorController.getPassengers);

module.exports = router;
