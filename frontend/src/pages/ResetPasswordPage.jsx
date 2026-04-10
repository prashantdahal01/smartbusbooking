import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import * as authService from "../services/auth.service";

export default function ResetPasswordPage() {
	const { token } = useParams();
	const [password, setPassword] = useState("");
	const [confirmPassword, setConfirmPassword] = useState("");
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	const onSubmit = async (e) => {
		e.preventDefault();
		setError("");
		setMessage("");

		if (!token) {
			setError("Reset token is missing");
			return;
		}
		if (password !== confirmPassword) {
			setError("Passwords do not match");
			return;
		}

		setLoading(true);
		try {
			const res = await authService.resetPassword(token, password, confirmPassword);
			setMessage(res?.message || "Password updated successfully");
		} catch (err) {
			setError(err?.response?.data?.message || err.message || "Reset failed");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div style={{ padding: 16, maxWidth: 420 }}>
			<h2>Reset Password</h2>
			{message ? (
				<div>
					<div>{message}</div>
					<p style={{ marginTop: 12, fontSize: 12 }}>
						<Link to="/login">Go to login</Link>
					</p>
				</div>
			) : (
				<form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
					<label>
						New password
						<input
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							type="password"
							required
							style={{ width: "100%" }}
						/>
					</label>
					<label>
						Confirm new password
						<input
							value={confirmPassword}
							onChange={(e) => setConfirmPassword(e.target.value)}
							type="password"
							required
							style={{ width: "100%" }}
						/>
					</label>
					{error ? <div>{error}</div> : null}
					<button disabled={loading} type="submit">
						{loading ? "Updating..." : "Update password"}
					</button>
				</form>
			)}
		</div>
	);
}
