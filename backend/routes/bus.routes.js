// API routes for bus management (admin/operator role required for mutations)
const express = require("express");
const router = express.Router();
const busController = require("../controllers/bus.controller");
const { verifyToken } = require("../middleware/auth.middleware");
const { authorizeRoles } = require("../middleware/role.middleware");

// GET    /api/buses/operator  – List buses assigned to the logged-in operator
// PUT    /api/buses/:id       – Update own bus (restricted: name/type/phone only)
// POST   /api/buses           – Explicitly blocked for operators
// DELETE /api/buses/:id       – Explicitly blocked for operators

router.use(verifyToken, authorizeRoles("operator"));

router.get("/operator", busController.getOperatorBuses);
router.post("/", busController.createOperatorBus);
router.put("/:id", busController.updateOperatorBus);
router.delete("/:id", busController.deleteOperatorBus);

module.exports = router;
