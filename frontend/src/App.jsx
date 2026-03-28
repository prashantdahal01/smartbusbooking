// Root React component with React Router configuration
// Defines all application routes with role-based protection
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Navbar from "./components/Navbar";

// Shared pages
// import LoginPage from "./pages/LoginPage";
// import RegisterPage from "./pages/RegisterPage";

// User pages
// import HomePage from "./pages/user/HomePage";
// import SearchPage from "./pages/user/SearchPage";
// import BookingPage from "./pages/user/BookingPage";
// import DashboardPage from "./pages/user/DashboardPage";

// Admin pages
// import AdminDashboard from "./pages/admin/AdminDashboard";
// import ManageBuses from "./pages/admin/ManageBuses";
// import ManageRoutes from "./pages/admin/ManageRoutes";
// import ManageUsers from "./pages/admin/ManageUsers";

// Operator pages
// import OperatorDashboard from "./pages/operator/OperatorDashboard";
// import MyBuses from "./pages/operator/MyBuses";
// import PassengerList from "./pages/operator/PassengerList";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Navbar />
        <Routes>
          {/* Public routes */}
          {/* <Route path="/login" element={<LoginPage />} /> */}
          {/* <Route path="/register" element={<RegisterPage />} /> */}

          {/* Customer routes */}
          {/* <Route path="/" element={<HomePage />} /> */}
          {/* <Route path="/search" element={<ProtectedRoute roles={["customer"]}><SearchPage /></ProtectedRoute>} /> */}

          {/* Admin routes */}
          {/* <Route path="/admin" element={<ProtectedRoute roles={["admin"]}><AdminDashboard /></ProtectedRoute>} /> */}

          {/* Operator routes */}
          {/* <Route path="/operator" element={<ProtectedRoute roles={["operator"]}><OperatorDashboard /></ProtectedRoute>} /> */}
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
