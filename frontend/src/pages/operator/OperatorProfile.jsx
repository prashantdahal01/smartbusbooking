import { Mail, Phone, ShieldUser, User } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { getProfileForOperator, updateOperatorProfile } from "../../services/operator.service";

export default function OperatorProfile() {
	const { currentUser, refreshMe } = useAuth();
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState("");
	const [notice, setNotice] = useState("");
	const [form, setForm] = useState({ name: "", phone: "", email: "", role: "operator" });

	useEffect(() => {
		let cancelled = false;
		const load = async () => {
			setLoading(true);
			setError("");
			try {
				const data = await getProfileForOperator();
				if (cancelled) return;
				setForm({
					name: String(data?.name || currentUser?.name || "").trim(),
					phone: String(data?.phone || currentUser?.phone || "").trim(),
					email: String(data?.email || currentUser?.email || "").trim(),
					role: String(data?.role || currentUser?.role || "operator").trim(),
				});
			} catch (err) {
				if (cancelled) return;
				setError(err?.response?.data?.message || err?.message || "Failed to load profile");
			} finally {
				if (!cancelled) setLoading(false);
			}
		};

		load();
		return () => {
			cancelled = true;
		};
	}, [currentUser]);

	useEffect(() => {
		if (!notice) return undefined;
		const timer = setTimeout(() => setNotice(""), 2600);
		return () => clearTimeout(timer);
	}, [notice]);

	const updateField = (key, value) => {
		setForm((prev) => ({ ...prev, [key]: value }));
	};

	const submit = async (event) => {
		event.preventDefault();
		setSaving(true);
		setError("");
		setNotice("");

		const payload = {
			name: String(form.name || "").trim(),
			phone: String(form.phone || "").trim(),
		};

		if (!payload.name) {
			setSaving(false);
			setError("Name is required");
			return;
		}

		try {
			await updateOperatorProfile(payload);
			await refreshMe();
			setNotice("Profile updated successfully");
		} catch (err) {
			setError(err?.response?.data?.message || err?.message || "Failed to update profile");
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="space-y-5">
			<div>
				<h2 className="text-2xl font-bold text-slate-900">Operator Profile</h2>
				<p className="text-sm text-slate-500">Keep your contact details up to date for coordination and support.</p>
			</div>

			{notice ? (
				<div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
					{notice}
				</div>
			) : null}

			{error ? (
				<div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
					{error}
				</div>
			) : null}

			<section className="admin-surface p-5">
				{loading ? (
					<div className="space-y-3">
						<div className="skeleton h-11 w-full" />
						<div className="skeleton h-11 w-full" />
						<div className="skeleton h-11 w-full" />
						<div className="skeleton h-11 w-40" />
					</div>
				) : (
					<form onSubmit={submit} className="grid gap-4 lg:max-w-2xl">
						<label className="grid gap-2">
							<span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
								<User className="h-4 w-4" />
								Full Name
							</span>
							<input
								value={form.name}
								onChange={(event) => updateField("name", event.target.value)}
								className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-orange-200 focus:ring-2 focus:ring-orange-100"
							/>
						</label>

						<label className="grid gap-2">
							<span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
								<Phone className="h-4 w-4" />
								Phone Number
							</span>
							<input
								value={form.phone}
								onChange={(event) => updateField("phone", event.target.value)}
								placeholder="98XXXXXXXX"
								className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-orange-200 focus:ring-2 focus:ring-orange-100"
							/>
						</label>

						<label className="grid gap-2">
							<span className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
								<Mail className="h-4 w-4" />
								Email Address
							</span>
							<input
								value={form.email}
								disabled
								className="h-11 cursor-not-allowed rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-500"
							/>
						</label>

						<div className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
							<ShieldUser className="h-4 w-4 text-orange-500" />
							Role: {form.role || "operator"}
						</div>

						<div>
							<button
								type="submit"
								disabled={saving}
								className="inline-flex h-10 items-center justify-center rounded-xl bg-orange-500 px-4 text-sm font-semibold text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
							>
								{saving ? "Saving..." : "Save Profile"}
							</button>
						</div>
					</form>
				)}
			</section>
		</div>
	);
}
