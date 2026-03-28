// Global authentication context providing login state, user role, and token
// Wraps the app to expose auth state to all child components via useContext
import { createContext, useContext, useState } from "react";

export const AuthContext = createContext(null);

// AuthProvider: wrap your app with this to provide auth state
export function AuthProvider({ children }) {
  // state: currentUser, token, role
  // actions: login(), logout()
  return <AuthContext.Provider value={{}}>{children}</AuthContext.Provider>;
}

// Custom hook for consuming auth context
export const useAuth = () => useContext(AuthContext);
