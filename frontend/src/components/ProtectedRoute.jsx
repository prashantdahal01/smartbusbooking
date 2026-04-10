// Route guard component that redirects unauthenticated or unauthorized users
// Usage: wrap protected <Route> elements with <ProtectedRoute roles={["admin"]} />
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ roles = [], children }) {
	const { token, role } = useAuth();

	if (!token) return <Navigate to="/login" replace />;
	if (roles.length > 0 && !roles.includes(role)) return <Navigate to="/" replace />;
	return children;
}
