const { ApiError } = require("../../utils/apiError");
const { handleControllerErrorRaw } = require("../../utils/controllerHelpersRaw");
const locationService = require("./location.service");
const { searchSchema } = require("./location.validation");

const validate = (schema, payload) => {
  const { error } = schema.validate(payload);
  if (error) {
    throw new ApiError(400, error.details?.[0]?.message || "Invalid request", null);
  }
};

exports.searchLocations = async (req, res) => {
  try {
    validate(searchSchema, req.query || {});
    const data = await locationService.searchLocations({ query: req.query });
    return res.json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};
