const express = require("express");
const router = express.Router();

const { verifyToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");
const { uploadBusImages, busImageUploadFields } = require("../middleware/upload.middleware");

const admin = require("../controllers/admin.controller");

router.use(verifyToken, authorizeRoles("admin"));

// Dashboard
router.get("/stats", admin.getDashboardStats);
router.get("/monthly-bookings", admin.getMonthlyBookings);
router.get("/top-routes", admin.getTopRoutes);
router.get("/revenue", admin.getRevenue);
router.get("/recent-bookings", admin.getRecentBookings);
router.get("/notifications", admin.getNotifications);
router.patch("/notifications/read-all", admin.markAllNotificationsRead);
router.patch("/notifications/:id/read", admin.markNotificationRead);
router.get("/search", admin.searchAll);
router.get("/bookings", admin.getAdminBookings);
router.patch("/bookings/:id/cancel", admin.cancelBookingByAdmin);

// Bus
router.post("/bus", uploadBusImages.fields(busImageUploadFields), admin.createBus);
router.get("/bus", admin.getBuses);
router.put("/bus/:id", uploadBusImages.fields(busImageUploadFields), admin.updateBus);
router.delete("/bus/:id", admin.deleteBus);

// Route
router.post("/route", admin.createRoute);
router.get("/route", admin.getRoutes);
router.put("/route/:id", admin.updateRoute);
router.delete("/route/:id", admin.deleteRoute);

// Schedule
router.post("/schedule", admin.createSchedule);
router.get("/schedule", admin.getSchedules);
router.put("/schedule/:id", admin.updateSchedule);
router.delete("/schedule/:id", admin.deleteSchedule);

// Users
router.get("/users", admin.getUsers);
router.put("/users/:id", admin.updateUser);
router.delete("/users/:id", admin.deleteUser);
router.get("/users/:id/bookings", admin.getUserBookings);

module.exports = router;