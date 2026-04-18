import { useEffect, useMemo, useState } from "react";

const defaultValues = {
	name: "",
	vehicleNumber: "",
	type: "AC",
	totalSeats: "",
	phone: "",
};

const typeOptions = [
	{ value: "AC", label: "AC" },
	{ value: "NON_AC", label: "Non-AC" },
	{ value: "SLEEPER", label: "Sleeper" },
];

const toFormValues = (initialValues) => {
	if (!initialValues || typeof initialValues !== "object") return defaultValues;

	const busTypes = Array.isArray(initialValues.busTypes) ? initialValues.busTypes : [];
	let derivedType = "AC";

	if (busTypes.some((type) => String(type || "").toUpperCase().includes("SLEEPER"))) {
		derivedType = "SLEEPER";
	} else if (busTypes.includes("AC")) {
		derivedType = "AC";
	} else {
		derivedType = "NON_AC";
	}

	return {
		name: String(initialValues.name || "").trim(),
		vehicleNumber: String(initialValues.vehicleNumber || "").trim(),
		type: derivedType,
		totalSeats: String(initialValues.totalSeats || "").trim(),
		phone: String(initialValues.phone || "").trim(),
	};
};

export default function BusForm({
	open,
	mode = "create",
	initialValues,
	onSubmit,
	onClose,
	loading = false,
}) {
	const [form, setForm] = useState(defaultValues);
	const [error, setError] = useState("");

	useEffect(() => {
		if (!open) return;
		setForm(toFormValues(initialValues));
		setError("");
	}, [open, initialValues]);

	const title = useMemo(() => (mode === "edit" ? "Edit Bus" : "Add New Bus"), [mode]);

	if (!open) return null;

	const handleChange = (key, value) => {
		setForm((prev) => ({ ...prev, [key]: value }));
	};

	const submit = async (event) => {
		event.preventDefault();
		setError("");

		const basePayload = {
			name: String(form.name || "").trim(),
			type: String(form.type || "").trim(),
			phone: String(form.phone || "").trim(),
		};

		if (!basePayload.name || !basePayload.type || !basePayload.phone) {
			setError("All fields are required");
			return;
		}

		const payload = { ...basePayload };
		if (mode !== "edit") {
			payload.vehicleNumber = String(form.vehicleNumber || "").trim();
			payload.totalSeats = Number(form.totalSeats);

			if (!payload.vehicleNumber) {
				setError("Bus number is required");
				return;
			}
			if (!Number.isFinite(payload.totalSeats) || payload.totalSeats <= 0) {
				setError("Total seats must be a positive number");
				return;
			}
		}

		try {
			await onSubmit(payload);
		} catch (err) {
			setError(err?.response?.data?.message || err?.message || "Failed to save bus");
		}
	};

	return (
		<div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 px-3">
			<div className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
				<div className="mb-4 flex items-start justify-between gap-3">
					<div>
						<h3 className="text-xl font-bold text-slate-900">{title}</h3>
						<p className="text-sm text-slate-500">Bus will be assigned to your operator account only.</p>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="rounded-lg px-3 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100"
					>
						Close
					</button>
				</div>

				<form onSubmit={submit} className="grid gap-4">
					<div className="grid gap-2">
						<label className="text-sm font-semibold text-slate-700" htmlFor="bus-name">Bus Name</label>
						<input
							id="bus-name"
							value={form.name}
							onChange={(event) => handleChange("name", event.target.value)}
							placeholder="Everest Deluxe"
							className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-orange-200 focus:ring-2 focus:ring-orange-100"
						/>
					</div>

					<div className="grid gap-4 sm:grid-cols-2">
						<div className="grid gap-2">
							<label className="text-sm font-semibold text-slate-700" htmlFor="vehicle-number">Bus Number</label>
							<input
								id="vehicle-number"
								value={form.vehicleNumber}
								onChange={(event) => handleChange("vehicleNumber", event.target.value)}
								placeholder="BA 2 PA 4567"
								disabled={mode === "edit"}
								className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-orange-200 focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
							/>
							{mode === "edit" ? (
								<p className="text-xs text-slate-500">Vehicle number is admin controlled.</p>
							) : null}
						</div>

						<div className="grid gap-2">
							<label className="text-sm font-semibold text-slate-700" htmlFor="bus-type">Bus Type</label>
							<select
								id="bus-type"
								value={form.type}
								onChange={(event) => handleChange("type", event.target.value)}
								className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-orange-200 focus:ring-2 focus:ring-orange-100"
							>
								{typeOptions.map((option) => (
									<option key={option.value} value={option.value}>{option.label}</option>
								))}
							</select>
						</div>
					</div>

					<div className="grid gap-4 sm:grid-cols-2">
						<div className="grid gap-2">
							<label className="text-sm font-semibold text-slate-700" htmlFor="bus-seats">Total Seats</label>
							<input
								id="bus-seats"
								type="number"
								min="1"
								value={form.totalSeats}
								onChange={(event) => handleChange("totalSeats", event.target.value)}
								placeholder="40"
								disabled={mode === "edit"}
								title={mode === "edit" ? "Only admin can modify seat capacity" : undefined}
								className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-orange-200 focus:ring-2 focus:ring-orange-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
							/>
							{mode === "edit" ? (
								<p
									className="text-xs font-medium text-amber-700"
									title="Only admin can modify seat capacity"
								>
									Seat capacity cannot be modified after bus creation.
								</p>
							) : null}
						</div>

						<div className="grid gap-2">
							<label className="text-sm font-semibold text-slate-700" htmlFor="bus-phone">Contact Phone</label>
							<input
								id="bus-phone"
								value={form.phone}
								onChange={(event) => handleChange("phone", event.target.value)}
								placeholder="98XXXXXXXX"
								className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-orange-200 focus:ring-2 focus:ring-orange-100"
							/>
						</div>
					</div>

					{error ? (
						<div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
					) : null}

					<div className="flex justify-end gap-2 pt-1">
						<button
							type="button"
							onClick={onClose}
							className="h-10 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
						>
							Cancel
						</button>
						<button
							type="submit"
							disabled={loading}
							className="h-10 rounded-xl bg-orange-500 px-4 text-sm font-semibold text-white hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
						>
							{loading ? "Saving..." : mode === "edit" ? "Update Bus" : "Create Bus"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
