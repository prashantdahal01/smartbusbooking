// Root React component with React Router configuration
// Defines all application routes with role-based protection
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Navbar from "./components/Navbar";

// Shared pages
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ForgotPasswordPage from "./pages/ForgotPasswordPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";

// User pages
import HomePage from "./pages/user/HomePage";
import SearchPage from "./pages/user/SearchPage";
import BookingPage from "./pages/user/BookingPage";
import DashboardPage from "./pages/user/DashboardPage";

// Admin pages
import AdminDashboard from "./pages/admin/AdminDashboard";
import ManageBuses from "./pages/admin/ManageBuses";
import ManageRoutes from "./pages/admin/ManageRoutes";
import ManageStops from "./pages/admin/ManageStops";
import ManageSchedules from "./pages/admin/ManageSchedules";
import ManageUsers from "./pages/admin/ManageUsers";

// Operator pages
import OperatorDashboard from "./pages/operator/OperatorDashboard";
import MyBuses from "./pages/operator/MyBuses";
import PassengerList from "./pages/operator/PassengerList";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Navbar />
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password/:token" element={<ResetPasswordPage />} />

          {/* Customer routes */}
          <Route path="/" element={<HomePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/booking/:scheduleId" element={<BookingPage />} />
          <Route path="/seats/:scheduleId" element={<BookingPage />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute roles={["customer"]}>
                <DashboardPage />
              </ProtectedRoute>
            }
          />

          {/* Admin routes */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute roles={["admin"]}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/buses"
            element={
              <ProtectedRoute roles={["admin"]}>
                <ManageBuses />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/routes"
            element={
              <ProtectedRoute roles={["admin"]}>
                <ManageRoutes />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/stops"
            element={
              <ProtectedRoute roles={["admin"]}>
                <ManageStops />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/schedules"
            element={
              <ProtectedRoute roles={["admin"]}>
                <ManageSchedules />
              </ProtectedRoute>
            }
          />
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute roles={["admin"]}>
                <ManageUsers />
              </ProtectedRoute>
            }
          />

          {/* Operator routes */}
          <Route
            path="/operator"
            element={
              <ProtectedRoute roles={["operator"]}>
                <OperatorDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/operator/buses"
            element={
              <ProtectedRoute roles={["operator"]}>
                <MyBuses />
              </ProtectedRoute>
            }
          />
          <Route
            path="/operator/passengers/:scheduleId"
            element={
              <ProtectedRoute roles={["operator"]}>
                <PassengerList />
              </ProtectedRoute>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
