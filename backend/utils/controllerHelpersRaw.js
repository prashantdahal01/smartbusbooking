const { isApiError } = require("./apiError");

const handleControllerErrorRaw = (res, err) => {
  if (isApiError(err)) {
    const payload = { message: err.message || "Request failed" };
    if (err.data && typeof err.data === "object" && !Array.isArray(err.data)) {
      Object.assign(payload, err.data);
    }
    return res.status(err.status || 500).json(payload);
  }

  // eslint-disable-next-line no-console
  console.error(err);
  return res.status(500).json({ message: "Internal server error" });
};

module.exports = {
  handleControllerErrorRaw,
};
