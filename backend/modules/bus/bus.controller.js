const { ApiError } = require("../../utils/apiError");
const { sendSuccess } = require("../../utils/apiResponse");
const { handleControllerError } = require("../../utils/controllerHelpers");
const busService = require("./bus.service");
const {
  createBusSchema,
  updateBusSchema,
  assignOperatorSchema,
  operatorUpdateSchema,
} = require("./bus.validation");

const validate = (schema, payload) => {
  const { error } = schema.validate(payload);
  if (error) {
    throw new ApiError(400, error.details?.[0]?.message || "Invalid request", null);
  }
};

exports.getBuses = async (req, res) => {
  try {
    if (req.user?.role === "operator") {
      const data = await busService.getOperatorBuses({ operatorId: req.user.id });
      return sendSuccess(res, { data, message: "Operator buses fetched" });
    }

    const data = await busService.getBuses({ includeInactive: false });
    return sendSuccess(res, { data, message: "Buses fetched" });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.getOperatorBuses = async (req, res) => {
  try {
    const data = await busService.getOperatorBuses({ operatorId: req.user?.id });
    return sendSuccess(res, { data, message: "Operator buses fetched" });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.createBus = async (req, res) => {
  try {
    validate(createBusSchema, req.body || {});
    const data = await busService.createBus({ body: req.body, files: req.files });
    return sendSuccess(res, { data, message: "Bus created", status: 201 });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.updateBus = async (req, res) => {
  try {
    if (req.user?.role === "operator") {
      validate(operatorUpdateSchema, req.body || {});
      const data = await busService.updateOperatorBus({
        operatorId: req.user?.id,
        busId: req.params.id,
        body: req.body,
      });
      return sendSuccess(res, { data, message: "Bus updated" });
    }

    validate(updateBusSchema, req.body || {});
    const data = await busService.updateBus({
      busId: req.params.id,
      body: req.body,
      files: req.files,
    });
    return sendSuccess(res, { data, message: "Bus updated" });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.deleteBus = async (req, res) => {
  try {
    const data = await busService.deleteBus({ busId: req.params.id });
    return sendSuccess(res, { data, message: data?.message || "Bus deleted" });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.assignOperator = async (req, res) => {
  try {
    validate(assignOperatorSchema, req.body || {});
    const data = await busService.assignOperator({
      busId: req.params.id,
      body: req.body,
    });
    return sendSuccess(res, { data, message: "Operator assigned" });
  } catch (error) {
    return handleControllerError(res, error);
  }
};
