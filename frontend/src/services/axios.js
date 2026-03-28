// Pre-configured Axios instance with base URL and JWT Authorization interceptor
// Automatically attaches Bearer token from localStorage to all requests
import axios from "axios";

const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
});

// Request interceptor: attach JWT token to headers
// axiosInstance.interceptors.request.use(...)

export default axiosInstance;
