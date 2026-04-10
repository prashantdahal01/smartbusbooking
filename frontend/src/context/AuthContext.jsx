// Global authentication context providing login state, user role, and token
// Wraps the app to expose auth state to all child components via useContext
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import * as authService from "../services/auth.service";

export const AuthContext = createContext(null);

// AuthProvider: wrap your app with this to provide auth state
export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("token") || "");
  const [currentUser, setCurrentUser] = useState(() => {
    const raw = localStorage.getItem("currentUser");
    return raw ? JSON.parse(raw) : null;
  });
  const role = currentUser?.role || "";

  useEffect(() => {
    if (token) localStorage.setItem("token", token);
    else localStorage.removeItem("token");
  }, [token]);

  useEffect(() => {
    if (currentUser) localStorage.setItem("currentUser", JSON.stringify(currentUser));
    else localStorage.removeItem("currentUser");
  }, [currentUser]);

  const login = async (email, password) => {
    const data = await authService.login(email, password);
    setToken(data.token);
    setCurrentUser(data.user);
    return data.user;
  };

  const register = async (userData) => {
    const data = await authService.register(userData);
    setToken(data.token);
    setCurrentUser(data.user);
    return data.user;
  };

  const logout = () => {
    setToken("");
    setCurrentUser(null);
  };

  const refreshMe = async () => {
    if (!token) return null;
    const data = await authService.me();
    setCurrentUser({ id: data._id || data.id, name: data.name, email: data.email, role: data.role });
    return data;
  };

  const value = useMemo(
    () => ({ token, currentUser, role, login, register, logout, refreshMe }),
    [token, currentUser, role]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Custom hook for consuming auth context
export const useAuth = () => useContext(AuthContext);
