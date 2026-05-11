const { ApiError } = require("../../utils/apiError");
const { handleControllerErrorRaw } = require("../../utils/controllerHelpersRaw");
const authService = require("./auth.service");
const { registerSchema, loginSchema, forgotSchema, resetSchema } = require("./auth.validation");

const validate = (schema, payload) => {
  const { error } = schema.validate(payload);
  if (error) {
    throw new ApiError(400, error.details?.[0]?.message || "Invalid request", null);
  }
};

exports.register = async (req, res) => {
  try {
    validate(registerSchema, req.body || {});
    const data = await authService.register({
      name: req.body?.name,
      email: req.body?.email,
      password: req.body?.password,
      phone: req.body?.phone,
    });
    return res.status(201).json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};

exports.login = async (req, res) => {
  try {
    validate(loginSchema, req.body || {});
    const data = await authService.login({
      email: req.body?.email,
      password: req.body?.password,
    });
    return res.json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};

exports.me = async (req, res) => {
  try {
    const data = await authService.me({ userId: req.user?.id });
    return res.json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    validate(forgotSchema, req.body || {});
    const data = await authService.forgotPassword({ email: req.body?.email });
    return res.json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};

exports.resetPassword = async (req, res) => {
  try {
    validate(resetSchema, req.body || {});
    const data = await authService.resetPassword({
      token: req.body?.token,
      password: req.body?.password,
      confirmPassword: req.body?.confirmPassword,
    });
    return res.json(data);
  } catch (error) {
    return handleControllerErrorRaw(res, error);
  }
};
