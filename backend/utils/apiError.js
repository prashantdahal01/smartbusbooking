class ApiError extends Error {
  constructor(status, message, data) {
    super(message || "Error");
    this.name = "ApiError";
    this.status = Number.isFinite(Number(status)) ? Number(status) : 500;
    this.data = data ?? null;
    this.isApiError = true;
  }
}

const isApiError = (err) => Boolean(err && err.isApiError);

module.exports = {
  ApiError,
  isApiError,
};
