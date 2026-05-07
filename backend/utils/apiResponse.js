const sendSuccess = (res, { data = null, message = "", status = 200 } = {}) => {
  return res.status(status).json({
    success: true,
    message,
    data,
  });
};

const sendError = (res, { status = 500, message = "Internal server error", data = null } = {}) => {
  return res.status(status).json({
    success: false,
    message,
    data,
  });
};

module.exports = {
  sendSuccess,
  sendError,
};
