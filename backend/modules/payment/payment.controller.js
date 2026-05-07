const paymentService = require("./payment.service");
const { sendSuccess } = require("../../utils/apiResponse");
const { handleControllerError } = require("../../utils/controllerHelpers");
const { ApiError } = require("../../utils/apiError");
const { initiateSchema, verifySchema, retrySchema } = require("./payment.validation");

const validate = (schema, payload) => {
  const { error } = schema.validate(payload);
  if (error) {
    throw new ApiError(400, error.details?.[0]?.message || "Invalid request", null);
  }
};

exports.initiateEsewaPayment = async (req, res) => {
  try {
    validate(initiateSchema, req.body || {});
    const data = await paymentService.initiateEsewaPayment({ userId: req.user?.id, body: req.body });
    return sendSuccess(res, { data, message: "Payment initiated" });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.retryEsewaPayment = async (req, res) => {
  try {
    validate(retrySchema, req.body || {});
    const data = await paymentService.retryEsewaPayment({ userId: req.user?.id, body: req.body });
    return sendSuccess(res, { data, message: "Payment retry initiated" });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.verifyEsewaPayment = async (req, res) => {
  try {
    validate(verifySchema, req.body || {});
    const data = await paymentService.verifyEsewaPayment({ userId: req.user?.id, body: req.body });
    return sendSuccess(res, { data, message: "Payment verification completed" });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.debugEsewaPayment = async (req, res) => {
  try {
    const data = await paymentService.debugEsewaPayment({ user: req.user, params: req.params, query: req.query });
    return sendSuccess(res, { data, message: "Payment debug data" });
  } catch (error) {
    return handleControllerError(res, error);
  }
};

exports.handleEsewaSuccess = async (req, res) => {
  try {
    const redirectUrl = await paymentService.handleEsewaSuccess({ query: req.query });
    return res.redirect(redirectUrl);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    return res.redirect("/dashboard?payment=error");
  }
};

exports.handleEsewaFailure = async (req, res) => {
  try {
    const redirectUrl = await paymentService.handleEsewaFailure({ query: req.query });
    return res.redirect(redirectUrl);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
    return res.redirect("/dashboard?payment=error");
  }
};
