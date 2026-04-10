// Shared login page for all user roles (admin, customer, operator)
import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function LoginPage() {
	const navigate = useNavigate();
	const location = useLocation();
	const { login, token, role } = useAuth();
	const [email, setEmail] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	if (token && role === "admin") return <Navigate to="/admin" replace />;
	if (token && role === "operator") return <Navigate to="/operator" replace />;
	if (token && role === "customer") return <Navigate to="/search" replace />;

	const onSubmit = async (e) => {
		e.preventDefault();
		setError("");
		setLoading(true);
		try {
			const user = await login(email, password);
			const redirect = new URLSearchParams(location.search).get("redirect");
			if (user.role === "admin") navigate("/admin");
			else if (user.role === "operator") navigate("/operator");
			else if (redirect && redirect.startsWith("/")) navigate(redirect);
			else navigate("/search");
		} catch (err) {
			setError(err?.response?.data?.message || err.message || "Login failed");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div style={{ padding: 16, maxWidth: 420 }}>
			<h2>Login</h2>
			<form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
				<label>
					Email
					<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required style={{ width: "100%" }} />
				</label>
				<label>
					Password
					<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required style={{ width: "100%" }} />
				</label>
				<div style={{ fontSize: 12 }}>
					<Link to="/forgot-password">Forgot password?</Link>
				</div>
				{error ? <div>{error}</div> : null}
				<button disabled={loading} type="submit">{loading ? "Logging in..." : "Login"}</button>
			</form>
			<p style={{ marginTop: 12, fontSize: 12 }}>
				Demo seed users (after seeding): admin@demo.com / operator@demo.com / customer@demo.com (password: password123)
			</p>
		</div>
	);
}
