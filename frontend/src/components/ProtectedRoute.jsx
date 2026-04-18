// Route guard component that redirects unauthenticated or unauthorized users
// Usage: wrap protected <Route> elements with <ProtectedRoute roles={["admin"]} />
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ roles = [], children }) {
	const location = useLocation();
	const { token, role, authLoading } = useAuth();

	if (authLoading || (token && roles.length > 0 && !role)) {
		return (
			<div className="grid min-h-[40vh] place-items-center px-4 text-sm text-slate-500">
				Checking your session...
			</div>
		);
	}

	if (!token) {
		const redirectPath = `${location.pathname}${location.search}`;
		return <Navigate to={`/login?redirect=${encodeURIComponent(redirectPath)}`} replace />;
	}
	if (roles.length > 0 && !roles.includes(role)) return <Navigate to="/" replace />;
	return children;
}
