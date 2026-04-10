const express = require("express");
const router = express.Router();

const stopController = require("../controllers/stop.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");

// POST /api/stops/auto-generate (admin)
router.post("/auto-generate", verifyToken, authorizeRoles("admin"), stopController.autoGenerateStops);

// POST /api/stops (admin)
router.post("/", verifyToken, authorizeRoles("admin"), stopController.createStop);

// PUT /api/stops/:id (admin)
router.put("/:id", verifyToken, authorizeRoles("admin"), stopController.updateStop);

// DELETE /api/stops/:id (admin)
router.delete("/:id", verifyToken, authorizeRoles("admin"), stopController.deleteStop);

module.exports = router;
