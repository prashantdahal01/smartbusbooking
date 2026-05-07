const express = require("express");
const router = express.Router();
const busController = require("./bus.controller");
const { verifyToken } = require("../../middleware/auth.middleware");
const { authorizeRoles } = require("../../middleware/role.middleware");
const { uploadBusImages, busImageUploadFields } = require("../../middleware/upload.middleware");

router.use(verifyToken);

router.get("/", authorizeRoles("admin", "operator"), busController.getBuses);
router.get("/operator", authorizeRoles("operator"), busController.getOperatorBuses);

router.post("/", authorizeRoles("admin"), uploadBusImages.fields(busImageUploadFields), busController.createBus);
router.put("/:id", authorizeRoles("admin", "operator"), uploadBusImages.fields(busImageUploadFields), busController.updateBus);
router.delete("/:id", authorizeRoles("admin"), busController.deleteBus);
router.patch("/:id/assign-operator", authorizeRoles("admin"), busController.assignOperator);

module.exports = router;
