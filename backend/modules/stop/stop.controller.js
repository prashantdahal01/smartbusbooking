const { ApiError } = require("../../utils/apiError");
const { handleControllerErrorRaw } = require("../../utils/controllerHelpersRaw");
const stopService = require("./stop.service");
const { createStopSchema, updateStopSchema } = require("./stop.validation");

const validate = (schema, payload) => {
  const { error } = schema.validate(payload);
  if (error) {
    throw new ApiError(400, error.details?.[0]?.message || "Invalid request", null);
  }
};

exports.getStopsByRoute = async (req, res) => {
  try {
    const routeId = req.params.id || req.query.routeId;
    const data = await stopService.getStopsByRoute({ routeId });
    return res.json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};

exports.autoGenerateStops = async (req, res) => {
  try {
    const data = await stopService.autoGenerateStops();
    return res.status(400).json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};

exports.createStop = async (req, res) => {
  try {
    validate(createStopSchema, req.body || {});
    const data = await stopService.createStop({ body: req.body });
    return res.status(201).json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};

exports.updateStop = async (req, res) => {
  try {
    validate(updateStopSchema, req.body || {});
    const data = await stopService.updateStop({ stopId: req.params.id, body: req.body });
    return res.json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};

exports.deleteStop = async (req, res) => {
  try {
    const data = await stopService.deleteStop({ stopId: req.params.id });
    return res.json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};
