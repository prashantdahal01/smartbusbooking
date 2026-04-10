// Service functions for authentication API calls: login, register, logout
import axiosInstance from "./axios";

// login(email, password) – POST /api/auth/login
// register(userData)     – POST /api/auth/register
// logout()               – POST /api/auth/logout

export async function login(email, password) {
	const res = await axiosInstance.post("/auth/login", { email, password });
	return res.data;
}

export async function register(userData) {
	const res = await axiosInstance.post("/auth/register", userData);
	return res.data;
}

export async function me() {
	const res = await axiosInstance.get("/auth/me");
	return res.data;
}

export async function forgotPassword(email) {
	const res = await axiosInstance.post("/auth/forgot-password", { email });
	return res.data;
}

export async function resetPassword(token, password, confirmPassword = undefined) {
	const payload = { token, password };
	if (confirmPassword !== undefined) payload.confirmPassword = confirmPassword;
	const res = await axiosInstance.post("/auth/reset-password", payload);
	return res.data;
}
