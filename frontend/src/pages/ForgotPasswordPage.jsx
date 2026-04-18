import { ArrowLeft, MailCheck, SendHorizonal, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import * as authService from "../services/auth.service";

export default function ForgotPasswordPage() {
	const [email, setEmail] = useState("");
	const [message, setMessage] = useState("");
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(false);

	const onSubmit = async (event) => {
		event.preventDefault();
		setError("");
		setMessage("");
		setLoading(true);

		try {
			const res = await authService.forgotPassword(String(email || "").trim());
			setMessage(res?.message || "If that email is registered, a password reset link has been sent.");
		} catch (err) {
			setError(err?.response?.data?.message || err.message || "Request failed");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="auth-slider-page">
			<div className="w-full max-w-5xl overflow-hidden rounded-[1.7rem] border border-sky-100 bg-white/95 shadow-[0_28px_90px_rgba(15,23,42,0.14)] backdrop-blur">
				<div className="grid min-h-135 md:grid-cols-[0.95fr_1.05fr]">
					<aside className="relative hidden overflow-hidden bg-linear-to-br from-slate-900 via-blue-900 to-blue-600 p-8 text-white md:flex md:flex-col md:justify-between">
						<div className="pointer-events-none absolute -left-16 -top-12 h-44 w-44 rounded-full bg-cyan-300/25 blur-3xl" />
						<div className="pointer-events-none absolute -bottom-16 right-0 h-52 w-52 rounded-full bg-emerald-300/25 blur-3xl" />

						<div className="relative">
							<p className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-sky-100">
								<ShieldCheck className="h-3.5 w-3.5" />
								Account Recovery
							</p>
							<h2 className="mt-4 text-3xl font-extrabold leading-tight">Reset your password securely</h2>
							<p className="mt-3 max-w-sm text-sm text-sky-100/90">
								Enter your registered email and we will send a one-time reset link to continue.
							</p>
						</div>

						<div className="relative space-y-2 text-sm text-sky-100/90">
							<p className="flex items-center gap-2">
								<span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
								Reset links expire for better security.
							</p>
							<p className="flex items-center gap-2">
								<span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
								You can request a new link anytime.
							</p>
						</div>
					</aside>

					<section className="flex items-center p-6 sm:p-8 md:p-10">
						<div className="w-full max-w-md">
							<Link
								to="/login"
								className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-blue-700 transition hover:text-blue-800"
							>
								<ArrowLeft className="h-3.5 w-3.5" />
								Back to login
							</Link>

							<h1 className="mt-4 text-3xl font-extrabold tracking-tight text-slate-900">Forgot password?</h1>
							<p className="mt-2 text-sm leading-relaxed text-slate-500">
								No worries. Provide your email and we&apos;ll send you a reset link.
							</p>

							<form onSubmit={onSubmit} className="mt-6 grid gap-4" noValidate>
								<div className="grid gap-1.5">
									<label htmlFor="forgot-email" className="text-xs font-bold uppercase tracking-[0.08em] text-slate-600">
										Email address
									</label>
									<input
										id="forgot-email"
										value={email}
										onChange={(event) => setEmail(event.target.value)}
										type="email"
										required
										placeholder="you@example.com"
										className="h-12 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-medium text-slate-800 outline-none transition focus:border-blue-300 focus:bg-white focus:ring-4 focus:ring-blue-100"
										autoComplete="email"
									/>
								</div>

								{error ? (
									<p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
										{error}
									</p>
								) : null}

								{message ? (
									<p className="inline-flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
										<MailCheck className="mt-0.5 h-4 w-4 shrink-0" />
										<span>{message}</span>
									</p>
								) : null}

								<button
									disabled={loading}
									type="submit"
									className="inline-flex h-12 items-center justify-center gap-2 rounded-full bg-linear-to-r from-blue-600 to-blue-700 px-5 text-sm font-extrabold uppercase tracking-[0.08em] text-white shadow-[0_14px_28px_rgba(37,99,235,0.28)] transition hover:-translate-y-0.5 hover:from-blue-500 hover:to-blue-700 disabled:cursor-not-allowed disabled:opacity-70"
								>
									<SendHorizonal className="h-4 w-4" />
									{loading ? "Sending..." : "Send reset link"}
								</button>
							</form>

							<p className="mt-4 text-xs text-slate-500">
								Remembered your password?{" "}
								<Link to="/login" className="font-bold text-blue-700 hover:text-blue-800">
									Sign in
								</Link>
							</p>
						</div>
					</section>
				</div>
			</div>
		</div>
	);
}
