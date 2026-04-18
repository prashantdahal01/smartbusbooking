// API routes for schedule management (admin role required for mutations)
const express = require("express");
const router = express.Router();
const scheduleController = require("../controllers/schedule.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");

// GET    /api/schedules          – List all schedules (supports search filters)
// POST   /api/schedules          – Create a new schedule (admin)
// PUT    /api/schedules/:id      – Update a schedule (admin)
// DELETE /api/schedules/:id      – Delete a schedule (admin)

router.get("/route-plan", scheduleController.getDistrictRoutePlan);
router.get("/search", scheduleController.searchSchedules);
router.get("/options", scheduleController.getSearchOptions);
router.get("/operator", verifyToken, authorizeRoles("operator"), scheduleController.getOperatorSchedules);
router.post("/", verifyToken, authorizeRoles("operator"), scheduleController.createOperatorSchedule);
router.put("/:id", verifyToken, authorizeRoles("operator"), scheduleController.updateOperatorSchedule);
router.delete("/:id", verifyToken, authorizeRoles("operator"), scheduleController.deleteOperatorSchedule);
router.get("/:id/seat-status", scheduleController.getSeatStatus);

module.exports = router;
