const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");
const { uploadBusImage } = require("../middleware/upload.middleware");

const admin = require("../controllers/admin.controller");

router.use(verifyToken, authorizeRoles("admin"));

// Bus
router.post("/bus", uploadBusImage.single("image"), admin.createBus);
router.get("/bus", admin.getBuses);
router.put("/bus/:id", uploadBusImage.single("image"), admin.updateBus);
router.delete("/bus/:id", admin.deleteBus);

// Route
router.post("/route", admin.createRoute);
router.get("/route", admin.getRoutes);
router.put("/route/:id", admin.updateRoute);

// Schedule
router.post("/schedule", admin.createSchedule);
router.get("/schedule", admin.getSchedules);
router.put("/schedule/:id", admin.updateSchedule);
router.delete("/schedule/:id", admin.deleteSchedule);

// Users
router.get("/users", admin.getUsers);

module.exports = router;