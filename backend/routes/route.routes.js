// API routes for route listing and stop retrieval
const express = require("express");
const router = express.Router();

const routeController = require("../controllers/route.controller");
const stopController = require("../controllers/stop.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");

// GET /api/routes
router.get("/", routeController.listRoutes);

// POST /api/routes (admin)
router.post("/", verifyToken, authorizeRoles("admin"), routeController.createRoute);

// GET /api/routes/:id/stops
router.get("/:id/stops", stopController.getStopsByRoute);

module.exports = router;
