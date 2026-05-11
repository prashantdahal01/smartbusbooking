const { ApiError } = require("../../utils/apiError");
const { handleControllerErrorRaw } = require("../../utils/controllerHelpersRaw");
const districtService = require("./district.service");
const { districtCreateSchema, districtUpdateSchema, citySchema } = require("./district.validation");

const validate = (schema, payload) => {
  const { error } = schema.validate(payload);
  if (error) {
    throw new ApiError(400, error.details?.[0]?.message || "Invalid request", null);
  }
};

exports.createDistrictWithCities = async (req, res) => {
  try {
    validate(districtCreateSchema, req.body || {});
    const data = await districtService.createDistrictWithCities({ body: req.body });
    return res.status(201).json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};

exports.getDistricts = async (req, res) => {
  try {
    const data = await districtService.getDistricts();
    return res.json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};

exports.updateDistrict = async (req, res) => {
  try {
    validate(districtUpdateSchema, req.body || {});
    const data = await districtService.updateDistrict({ districtId: req.params.id, body: req.body });
    return res.json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};

exports.deleteDistrict = async (req, res) => {
  try {
    const data = await districtService.deleteDistrict({ districtId: req.params.id });
    return res.json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};

exports.addCityToDistrict = async (req, res) => {
  try {
    validate(citySchema, req.body || {});
    const data = await districtService.addCityToDistrict({ districtId: req.params.id, body: req.body });
    return res.status(201).json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};

exports.updateCity = async (req, res) => {
  try {
    validate(citySchema, req.body || {});
    const data = await districtService.updateCity({
      districtId: req.params.districtId,
      cityId: req.params.cityId,
      body: req.body,
    });
    return res.json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};

exports.deleteCity = async (req, res) => {
  try {
    const data = await districtService.deleteCity({
      districtId: req.params.districtId,
      cityId: req.params.cityId,
    });
    return res.json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};
