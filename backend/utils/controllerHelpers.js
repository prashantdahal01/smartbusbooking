const { isApiError } = require("./apiError");
const { sendError } = require("./apiResponse");

const handleControllerError = (res, err) => {
  if (isApiError(err)) {
    return sendError(res, {
      status: err.status,
      message: err.message || "Request failed",
      data: err.data ?? null,
    });
  }

  // eslint-disable-next-line no-console
  console.error(err);
  return sendError(res, { status: 500, message: "Internal server error", data: null });
};

module.exports = {
  handleControllerError,
};
