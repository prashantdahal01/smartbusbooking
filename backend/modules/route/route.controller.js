const { ApiError } = require("../../utils/apiError");
const { handleControllerErrorRaw } = require("../../utils/controllerHelpersRaw");
const routeService = require("./route.service");
const { createRouteSchema } = require("./route.validation");

const validate = (schema, payload) => {
  const { error } = schema.validate(payload);
  if (error) {
    throw new ApiError(400, error.details?.[0]?.message || "Invalid request", null);
  }
};

exports.listRoutes = async (req, res) => {
  try {
    const data = await routeService.listRoutes();
    return res.json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};

exports.listPopularRoutes = async (req, res) => {
  try {
    const data = await routeService.listPopularRoutes({ query: req.query });
    return res.json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};

exports.createRoute = async (req, res) => {
  try {
    validate(createRouteSchema, req.body || {});
    const data = await routeService.createRoute({ body: req.body });
    return res.status(201).json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};

exports.syncRoutePointLanes = async (req, res) => {
  try {
    const data = await routeService.syncRoutePointLanes({ routeId: req.params?.id });
    return res.json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};
