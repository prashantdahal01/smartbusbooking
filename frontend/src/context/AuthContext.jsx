// Global authentication context providing login state, user role, and token
// Wraps the app to expose auth state to all child components via useContext
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import * as authService from "../services/auth.service";
import {
  clearAuthSession,
  getStoredToken,
  getStoredUser,
  getTokenStorageType,
  listenForAuthUnauthorized,
  persistAuthSession,
} from "../utils/authStorage";

export const AuthContext = createContext(null);

const mapUser = (user) => {
  if (!user || typeof user !== "object") return null;

  return {
    id: user.id || user._id,
    name: user.name || "",
    email: user.email || "",
    role: user.role || "",
    phone: user.phone || "",
  };
};

// AuthProvider: wrap your app with this to provide auth state
export function AuthProvider({ children }) {
  const initialToken = getStoredToken();
  const [token, setToken] = useState(initialToken);
  const [currentUser, setCurrentUser] = useState(() => getStoredUser());
  const [authLoading, setAuthLoading] = useState(() => Boolean(initialToken));
  const role = currentUser?.role || "";

  const clearAuthState = useCallback(() => {
    clearAuthSession();
    setToken("");
    setCurrentUser(null);
    setAuthLoading(false);
  }, []);

  useEffect(() => {
    const unsubscribe = listenForAuthUnauthorized(() => {
      clearAuthState();
    });

    return unsubscribe;
  }, [clearAuthState]);

  useEffect(() => {
    let cancelled = false;

    const validateStoredSession = async () => {
      if (!token) {
        if (!cancelled) {
          setCurrentUser(null);
          setAuthLoading(false);
        }
        return;
      }

      if (!cancelled) setAuthLoading(true);

      try {
        const data = await authService.me();
        if (cancelled) return;

        const validatedUser = mapUser(data);
        setCurrentUser(validatedUser);
        persistAuthSession({
          token,
          user: validatedUser,
          persist: getTokenStorageType() === "local",
        });
      } catch {
        if (cancelled) return;
        clearAuthState();
      } finally {
        if (!cancelled) setAuthLoading(false);
      }
    };

    // eslint-disable-next-line no-void
    void validateStoredSession();

    return () => {
      cancelled = true;
    };
  }, [token, clearAuthState]);

  const login = async (email, password, options = {}) => {
    const persist = options.persist !== false;
    setAuthLoading(true);

    try {
      const data = await authService.login(email, password);
      const user = mapUser(data.user);

      persistAuthSession({ token: data.token, user, persist });
      setToken(data.token);
      setCurrentUser(user);
      return user;
    } finally {
      setAuthLoading(false);
    }
  };

  const register = async (userData, options = {}) => {
    const persist = options.persist !== false;
    setAuthLoading(true);

    try {
      const data = await authService.register(userData);
      const user = mapUser(data.user);

      persistAuthSession({ token: data.token, user, persist });
      setToken(data.token);
      setCurrentUser(user);
      return user;
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = useCallback(() => {
    clearAuthState();
  }, [clearAuthState]);

  const refreshMe = async () => {
    if (!token) return null;

    setAuthLoading(true);
    try {
      const data = await authService.me();
      const refreshedUser = mapUser(data);
      setCurrentUser(refreshedUser);
      persistAuthSession({
        token,
        user: refreshedUser,
        persist: getTokenStorageType() === "local",
      });
      return data;
    } catch (error) {
      if (error?.response?.status === 401) {
        clearAuthState();
      }
      throw error;
    } finally {
      setAuthLoading(false);
    }
  };

  const value = useMemo(
    () => ({ token, currentUser, role, authLoading, login, register, logout, refreshMe }),
    [token, currentUser, role, authLoading, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Custom hook for consuming auth context
export const useAuth = () => useContext(AuthContext);
