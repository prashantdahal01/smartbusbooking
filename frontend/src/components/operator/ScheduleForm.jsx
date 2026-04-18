import { useEffect, useMemo, useState } from "react";

const emptyForm = {
	bus: "",
	route: "",
	date: "",
	time: "",
	arrivalDate: "",
	arrivalTime: "",
	price: "",
	isActive: true,
};

const toFormState = (initialValues) => {
	if (!initialValues || typeof initialValues !== "object") return emptyForm;

	return {
		bus: String(initialValues.bus?._id || initialValues.bus || "").trim(),
		route: String(initialValues.route?._id || initialValues.route || "").trim(),
		date: String(initialValues.date || "").trim(),
		time: String(initialValues.time || "").trim(),
		arrivalDate: String(initialValues.arrivalDate || "").trim(),
		arrivalTime: String(initialValues.arrivalTime || "").trim(),
		price: String(initialValues.price ?? "").trim(),
		isActive: initialValues.isActive !== false,
	};
};

const isValidDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || "").trim());
const isValidTime = (value) => /^\d{2}:\d{2}$/.test(String(value || "").trim());

const routeLabel = (route) => {
	const source = String(route?.source || route?.sourceCity?.name || "Unknown").trim();
	const destination = String(route?.destination || route?.destinationCity?.name || "Unknown").trim();
	return `${source} -> ${destination}`;
};

const busLabel = (bus) => {
	const name = String(bus?.name || "").trim();
	const busNo = String(bus?.vehicleNumber || "").trim();
	return busNo ? `${name} (${busNo})` : name;
};

export default function ScheduleForm({
	open,
	mode = "create",
	initialValues,
	buses = [],
	routes = [],
	onSubmit,
	onClose,
	loading = false,
}) {
	const [form, setForm] = useState(emptyForm);
	const [error, setError] = useState("");

	useEffect(() => {
		if (!open) return;
		setForm(toFormState(initialValues));
		setError("");
	}, [open, initialValues]);

	const title = useMemo(
		() => (mode === "edit" ? "Edit Schedule" : "Create Schedule"),
		[mode]
	);

	if (!open) return null;

	const setField = (key, value) => {
		setForm((prev) => ({ ...prev, [key]: value }));
	};

	const submit = async (event) => {
		event.preventDefault();
		setError("");

		const basePayload = {
			time: String(form.time || "").trim(),
			price: Number(form.price),
			isActive: Boolean(form.isActive),
		};

		if (!isValidTime(basePayload.time)) {
			setError("Time must use HH:mm format");
			return;
		}
		if (!Number.isFinite(basePayload.price) || basePayload.price < 0) {
			setError("Price must be a non-negative number");
			return;
		}

		let payload = { ...basePayload };

		if (mode !== "edit") {
			payload = {
				...basePayload,
				bus: String(form.bus || "").trim(),
				route: String(form.route || "").trim(),
				date: String(form.date || "").trim(),
				arrivalDate: String(form.arrivalDate || form.date || "").trim(),
				arrivalTime: String(form.arrivalTime || "").trim(),
			};

			if (!payload.bus || !payload.route) {
				setError("Select both bus and route");
				return;
			}
			if (!isValidDate(payload.date) || !isValidDate(payload.arrivalDate)) {
				setError("Date fields must use YYYY-MM-DD format");
				return;
			}
			if (!isValidTime(payload.arrivalTime)) {
				setError("Arrival time must use HH:mm format");
				return;
			}
		}

		try {
			await onSubmit(payload);
		} catch (err) {
			setError(err?.response?.data?.message || err?.message || "Failed to save schedule");
		}
	};

	return (
		<div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/45 px-3">
			<div className="w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl">
				<div className="mb-4 flex items-start justify-between gap-3">
					<div>
						<h3 className="text-xl font-bold text-slate-900">{title}</h3>
						<p className="text-sm text-slate-500">
							Boarding and dropping path is auto-generated from route definition.
						</p>
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
					{mode === "edit" ? (
						<div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
							<p className="font-semibold">Route structure and stops are locked for operators.</p>
							<p className="mt-1 text-xs">Only departure time, fare, and active status can be changed.</p>
						</div>
					) : null}

					{mode === "edit" ? (
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="grid gap-2">
								<label className="text-sm font-semibold text-slate-700">Bus</label>
								<input
									value={busLabel(initialValues?.bus || {})}
									disabled
									className="h-11 rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm text-slate-500"
								/>
							</div>

							<div className="grid gap-2">
								<label className="text-sm font-semibold text-slate-700">Route</label>
								<input
									value={routeLabel(initialValues?.route || {})}
									disabled
									className="h-11 rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm text-slate-500"
								/>
							</div>
						</div>
					) : (
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="grid gap-2">
								<label htmlFor="schedule-bus" className="text-sm font-semibold text-slate-700">Bus</label>
								<select
									id="schedule-bus"
									value={form.bus}
									onChange={(event) => setField("bus", event.target.value)}
									className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-orange-200 focus:ring-2 focus:ring-orange-100"
								>
									<option value="">Select bus</option>
									{buses.map((bus) => (
										<option key={bus._id} value={bus._id}>{busLabel(bus)}</option>
									))}
								</select>
							</div>

							<div className="grid gap-2">
								<label htmlFor="schedule-route" className="text-sm font-semibold text-slate-700">Route</label>
								<select
									id="schedule-route"
									value={form.route}
									onChange={(event) => setField("route", event.target.value)}
									className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-orange-200 focus:ring-2 focus:ring-orange-100"
								>
									<option value="">Select route</option>
									{routes.map((route) => (
										<option key={route._id} value={route._id}>{routeLabel(route)}</option>
									))}
								</select>
							</div>
						</div>
					)}

					<div className="grid gap-4 sm:grid-cols-2">
						{mode === "edit" ? (
							<div className="grid gap-2">
								<label className="text-sm font-semibold text-slate-700">Departure Date</label>
								<input
									value={form.date}
									disabled
									className="h-11 rounded-xl border border-slate-200 bg-slate-100 px-3 text-sm text-slate-500"
								/>
							</div>
						) : (
							<div className="grid gap-2">
								<label htmlFor="schedule-date" className="text-sm font-semibold text-slate-700">Departure Date</label>
								<input
									id="schedule-date"
									type="date"
									value={form.date}
									onChange={(event) => setField("date", event.target.value)}
									className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-orange-200 focus:ring-2 focus:ring-orange-100"
								/>
							</div>
						)}

						<div className="grid gap-2">
							<label htmlFor="schedule-time" className="text-sm font-semibold text-slate-700">Departure Time</label>
							<input
								id="schedule-time"
								type="time"
								value={form.time}
								onChange={(event) => setField("time", event.target.value)}
								className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-orange-200 focus:ring-2 focus:ring-orange-100"
							/>
						</div>
					</div>

					<div className="grid gap-4 sm:grid-cols-3">
						{mode !== "edit" ? (
							<>
								<div className="grid gap-2">
									<label htmlFor="schedule-arrival-date" className="text-sm font-semibold text-slate-700">Arrival Date</label>
									<input
										id="schedule-arrival-date"
										type="date"
										value={form.arrivalDate}
										onChange={(event) => setField("arrivalDate", event.target.value)}
										className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-orange-200 focus:ring-2 focus:ring-orange-100"
									/>
								</div>

								<div className="grid gap-2">
									<label htmlFor="schedule-arrival-time" className="text-sm font-semibold text-slate-700">Arrival Time</label>
									<input
										id="schedule-arrival-time"
										type="time"
										value={form.arrivalTime}
										onChange={(event) => setField("arrivalTime", event.target.value)}
										className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-orange-200 focus:ring-2 focus:ring-orange-100"
									/>
								</div>
							</>
						) : null}

						<div className="grid gap-2">
							<label htmlFor="schedule-price" className="text-sm font-semibold text-slate-700">Price (NPR)</label>
							<input
								id="schedule-price"
								type="number"
								min="0"
								step="0.01"
								value={form.price}
								onChange={(event) => setField("price", event.target.value)}
								placeholder="1200"
								className="h-11 rounded-xl border border-slate-200 px-3 text-sm outline-none focus:border-orange-200 focus:ring-2 focus:ring-orange-100"
							/>
						</div>
					</div>

					<label className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
						<input
							type="checkbox"
							checked={form.isActive}
							onChange={(event) => setField("isActive", event.target.checked)}
							className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-200"
						/>
						Keep this schedule active for search and booking
					</label>

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
							{loading ? "Saving..." : mode === "edit" ? "Update Schedule" : "Create Schedule"}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
