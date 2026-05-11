const express = require("express");
const router = express.Router();

const stopController = require("./stop.controller");
const { verifyToken } = require("../../middleware/auth.middleware");
const { authorizeRoles } = require("../../middleware/role.middleware");

router.post("/auto-generate", verifyToken, authorizeRoles("admin"), stopController.autoGenerateStops);
router.post("/", verifyToken, authorizeRoles("admin"), stopController.createStop);
router.put("/:id", verifyToken, authorizeRoles("admin"), stopController.updateStop);
router.delete("/:id", verifyToken, authorizeRoles("admin"), stopController.deleteStop);

module.exports = router;
