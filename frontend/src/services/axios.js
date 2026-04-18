// Pre-configured Axios instance with base URL and JWT Authorization interceptor
// Automatically attaches Bearer token from auth storage to all requests
import axios from "axios";
import { clearAuthSession, emitAuthUnauthorized, getStoredToken } from "../utils/authStorage";

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5001/api",
});

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
    const isPublicAuthRequest = /\/auth\/(login|register|forgot-password|reset-password)$/i.test(requestUrl);

    if (status === 401 && !isPublicAuthRequest && getStoredToken()) {
      clearAuthSession();
      emitAuthUnauthorized();
    }

    return Promise.reject(error);
  }
);

export default axiosInstance;
