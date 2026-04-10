// Shared registration page for new customer accounts
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function RegisterPage() {
	const navigate = useNavigate();
	const { register } = useAuth();
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [phone, setPhone] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	const onSubmit = async (e) => {
		e.preventDefault();
		setError("");
		setLoading(true);
		try {
			await register({ name, email, phone, password });
			navigate("/search");
		} catch (err) {
			setError(err?.response?.data?.message || err.message || "Registration failed");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div style={{ padding: 16, maxWidth: 420 }}>
			<h2>Register</h2>
			<form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
				<label>
					Name
					<input value={name} onChange={(e) => setName(e.target.value)} required style={{ width: "100%" }} />
				</label>
				<label>
					Email
					<input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required style={{ width: "100%" }} />
				</label>
				<label>
					Phone
					<input value={phone} onChange={(e) => setPhone(e.target.value)} style={{ width: "100%" }} />
				</label>
				<label>
					Password
					<input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required style={{ width: "100%" }} />
				</label>
				{error ? <div>{error}</div> : null}
				<button disabled={loading} type="submit">{loading ? "Creating..." : "Create account"}</button>
			</form>
		</div>
	);
}
