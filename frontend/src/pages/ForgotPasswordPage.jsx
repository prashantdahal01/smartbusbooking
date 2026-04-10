import { useState } from "react";
import { Link } from "react-router-dom";
import * as authService from "../services/auth.service";

export default function ForgotPasswordPage() {
	const [email, setEmail] = useState("");
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	const onSubmit = async (e) => {
		e.preventDefault();
		setError("");
		setMessage("");
		setLoading(true);
		try {
			const res = await authService.forgotPassword(email);
			setMessage(res?.message || "If that email is registered, a password reset link has been sent.");
		} catch (err) {
			setError(err?.response?.data?.message || err.message || "Request failed");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div style={{ padding: 16, maxWidth: 420 }}>
			<h2>Forgot Password</h2>
			<p style={{ fontSize: 14, marginTop: 6 }}>
				Enter your registered email address and we’ll send you a password reset link.
			</p>

			<form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
				<label>
					Email
					<input
						value={email}
						onChange={(e) => setEmail(e.target.value)}
						type="email"
						required
						style={{ width: "100%" }}
					/>
				</label>
				{error ? <div>{error}</div> : null}
				{message ? <div>{message}</div> : null}
				<button disabled={loading} type="submit">
					{loading ? "Sending..." : "Send reset link"}
				</button>
			</form>

			<p style={{ marginTop: 12, fontSize: 12 }}>
				<Link to="/login">Back to login</Link>
			</p>
		</div>
	);
}
