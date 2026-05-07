// Root React component with React Router configuration
// Defines all application routes with role-based protection
import { Suspense, lazy } from "react";
import { Toaster } from "react-hot-toast";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Navbar from "./components/Navbar";
import ErrorBoundary from "./components/ErrorBoundary";

const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const ForgotPasswordPage = lazy(() => import("./pages/ForgotPasswordPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));

const HomePage = lazy(() => import("./pages/user/HomePage"));
const SearchPage = lazy(() => import("./pages/user/SearchPage"));
const BookingPage = lazy(() => import("./pages/user/BookingPage"));
const DashboardPage = lazy(() => import("./pages/user/DashboardPage"));
const TicketPage = lazy(() => import("./pages/user/TicketPage"));

const AdminLayout = lazy(() => import("./components/admin/AdminLayout"));
const AdminDashboard = lazy(() => import("./pages/admin/AdminDashboard"));
const ManageBuses = lazy(() => import("./pages/admin/ManageBuses"));
const ManageRoutes = lazy(() => import("./pages/admin/ManageRoutes"));
const ManageStops = lazy(() => import("./pages/admin/ManageStops"));
const ManageSchedules = lazy(() => import("./pages/admin/ManageSchedules"));
const ManageUsers = lazy(() => import("./pages/admin/ManageUsers"));
const ManageBookings = lazy(() => import("./pages/admin/ManageBookings"));
const Settings = lazy(() => import("./pages/admin/Settings"));

const OperatorLayout = lazy(() => import("./components/operator/OperatorLayout"));
const OperatorDashboard = lazy(() => import("./pages/operator/OperatorDashboard"));
const ManageOperatorBuses = lazy(() => import("./pages/operator/ManageBuses"));
const ManageOperatorSchedules = lazy(() => import("./pages/operator/ManageSchedules"));
const ViewOperatorBookings = lazy(() => import("./pages/operator/ViewBookings"));
const OperatorProfile = lazy(() => import("./pages/operator/OperatorProfile"));
const OperatorRoutesPage = lazy(() => import("./pages/operator/RoutesPage"));
const OperatorPassengersPage = lazy(() => import("./pages/operator/PassengersPage"));
const OperatorPassengerList = lazy(() => import("./pages/operator/PassengerList"));
const OperatorReportsPage = lazy(() => import("./pages/operator/ReportsPage"));
const OperatorSettingsPage = lazy(() => import("./pages/operator/OperatorSettings"));

function RouteFallback() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="skeleton h-40 w-full rounded-2xl" />
      <div className="mt-3 skeleton h-40 w-full rounded-2xl" />
    </div>
  );
}

function AppShell() {
  const location = useLocation();
  const hideNavbar = location.pathname.startsWith("/admin")
    || location.pathname.startsWith("/operator")
    || location.pathname.startsWith("/ticket");

  return (
    <>
      {!hideNavbar ? <Navbar /> : null}
      <ErrorBoundary resetKey={location.pathname}>
        <Suspense fallback={<RouteFallback />}>
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
            <Route path="/seats/:busId" element={<BookingPage />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute roles={["customer"]}>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/ticket/:bookingId"
              element={
                <ProtectedRoute roles={["customer"]}>
                  <TicketPage />
                </ProtectedRoute>
              }
            />

            {/* Admin routes */}
            <Route
              path="/admin"
              element={
                <ProtectedRoute roles={["admin"]}>
                  <AdminLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<AdminDashboard />} />
              <Route path="buses" element={<ManageBuses />} />
              <Route path="routes" element={<ManageRoutes />} />
              <Route path="stops" element={<ManageStops />} />
              <Route path="schedules" element={<ManageSchedules />} />
              <Route path="bookings" element={<ManageBookings />} />
              <Route path="users" element={<ManageUsers />} />
              <Route path="settings" element={<Settings />} />
            </Route>

            {/* Operator routes */}
            <Route
              path="/operator"
              element={
                <ProtectedRoute roles={["operator"]}>
                  <OperatorLayout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<OperatorDashboard />} />
              <Route path="buses" element={<ManageOperatorBuses />} />
              <Route path="schedules" element={<ManageOperatorSchedules />} />
              <Route path="bookings" element={<ViewOperatorBookings />} />
              <Route path="routes" element={<OperatorRoutesPage />} />
              <Route path="passengers" element={<OperatorPassengersPage />} />
              <Route path="passengers/:scheduleId" element={<OperatorPassengerList />} />
              <Route path="reports" element={<OperatorReportsPage />} />
              <Route path="settings" element={<OperatorSettingsPage />} />
              <Route path="profile" element={<OperatorProfile />} />
            </Route>
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppShell />
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3200,
            style: {
              background: "#0f172a",
              color: "#ffffff",
              borderRadius: "12px",
              fontSize: "14px",
            },
            success: {
              style: {
                background: "#047857",
                color: "#ffffff",
              },
            },
            error: {
              style: {
                background: "#be123c",
                color: "#ffffff",
              },
            },
          }}
        />
      </BrowserRouter>
    </AuthProvider>
  );
}
