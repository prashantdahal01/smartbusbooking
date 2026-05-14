const { ApiError } = require("../../utils/apiError");
const { handleControllerErrorRaw } = require("../../utils/controllerHelpersRaw");
const scheduleService = require("./schedule.service");
const {
  searchSchema,
  operatorScheduleCreateSchema,
  operatorScheduleUpdateSchema,
} = require("./schedule.validation");

const validate = (schema, payload) => {
  const { error } = schema.validate(payload);
  if (error) {
    throw new ApiError(400, error.details?.[0]?.message || "Invalid request", null);
  }
};

exports.searchSchedules = async (req, res) => {
  try {
    const query = req.query || {};
    // Add from/to compatibility mapping
    if (query.from && !query.source) query.source = query.from;
    if (query.to && !query.destination) query.destination = query.to;
    validate(searchSchema, query);
    const data = await scheduleService.searchSchedules({ query });
    return res.json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};

exports.getAvailableSchedules = async (_req, res) => {
  try {
    const data = await scheduleService.getAvailableSchedules();
    return res.json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};

exports.getDistrictRoutePlan = async (req, res) => {
  try {
    const data = await scheduleService.getDistrictRoutePlan({ query: req.query });
    return res.json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};

exports.getSearchOptions = async (req, res) => {
  try {
    const data = await scheduleService.getSearchOptions();
    return res.json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};

exports.getOperatorSchedules = async (req, res) => {
  try {
    const data = await scheduleService.getOperatorSchedules({ userId: req.user?.id, query: req.query });
    return res.json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};

exports.createOperatorSchedule = async (req, res) => {
  try {
    validate(operatorScheduleCreateSchema, req.body || {});
    const data = await scheduleService.createOperatorSchedule({ userId: req.user?.id, body: req.body });
    return res.status(201).json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};

exports.updateOperatorSchedule = async (req, res) => {
  try {
    validate(operatorScheduleUpdateSchema, req.body || {});
    const data = await scheduleService.updateOperatorSchedule({
      userId: req.user?.id,
      scheduleId: req.params.id,
      body: req.body,
    });
    return res.json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};

exports.deleteOperatorSchedule = async (req, res) => {
  try {
    const data = await scheduleService.deleteOperatorSchedule({
      userId: req.user?.id,
      scheduleId: req.params.id,
    });
    return res.json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};

exports.getSeatStatus = async (req, res) => {
  try {
    const data = await scheduleService.getSeatStatus({ scheduleId: req.params.id });
    return res.json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};
