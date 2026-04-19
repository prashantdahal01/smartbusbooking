// Pre-configured Axios instance with base URL and JWT Authorization interceptor
// Automatically attaches Bearer token from auth storage to all requests
import axios from "axios";
import { clearAuthSession, emitAuthUnauthorized, getStoredToken } from "../utils/authStorage";
import { getApiBaseUrl } from "../utils/helpers";

const resolvedApiBaseUrl = getApiBaseUrl();
const hasConfiguredApi = Boolean(String(import.meta.env.VITE_API_URL || "").trim());
const isProductionBuild = Boolean(import.meta.env.PROD);
const isFallbackApiInProduction = isProductionBuild && !hasConfiguredApi && resolvedApiBaseUrl === "/api";

const axiosInstance = axios.create({
  baseURL: resolvedApiBaseUrl,
});

if (
  isProductionBuild &&
  !hasConfiguredApi
) {
  // eslint-disable-next-line no-console
  console.warn(
    "VITE_API_URL is not set. API requests are using '/api' fallback. Configure VITE_API_URL on your hosting provider for production."
  );
}

// Request interceptor: attach JWT token to headers
axiosInstance.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const requestUrl = String(error?.config?.url || "").split("?")[0];
    const responseContentType = String(error?.response?.headers?.["content-type"] || "");
    const isPublicAuthRequest = /\/auth\/(login|register|forgot-password|reset-password)$/i.test(requestUrl);

    if (!error?.response) {
      if (!hasConfiguredApi) {
        error.message =
          "Network error: API base URL is not configured for production. Set VITE_API_URL in Vercel to your backend URL ending with /api.";
      }
    }

    if (
      isFallbackApiInProduction &&
      (status === 404 || /text\/html/i.test(responseContentType))
    ) {
      error.message =
        "API route is unavailable on this deployment. Set VITE_API_URL in Vercel to your public backend URL ending with /api, then redeploy.";
    }

    if (status === 401 && !isPublicAuthRequest && getStoredToken()) {
      clearAuthSession();
      emitAuthUnauthorized();
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
