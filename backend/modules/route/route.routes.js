const express = require("express");
const router = express.Router();

const routeController = require("./route.controller");
const stopController = require("../stop/stop.controller");
const { verifyToken } = require("../../middleware/auth.middleware");
const { authorizeRoles } = require("../../middleware/role.middleware");

router.get("/", routeController.listRoutes);
router.get("/popular", routeController.listPopularRoutes);
router.post("/", verifyToken, authorizeRoles("admin"), routeController.createRoute);
router.post("/:id/sync-points", verifyToken, authorizeRoles("admin"), routeController.syncRoutePointLanes);
router.get("/:id/stops", stopController.getStopsByRoute);

module.exports = router;
