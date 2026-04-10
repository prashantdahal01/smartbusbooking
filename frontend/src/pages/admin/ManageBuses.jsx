// Admin page for adding, editing, and deleting buses in the system
import { useEffect, useState } from "react";
import { createBus, getBuses } from "../../services/admin.service";
import { toAbsoluteAssetUrl } from "../../utils/helpers";

export default function ManageBuses() {
	const [buses, setBuses] = useState([]);
	const [name, setName] = useState("");
	const [vehicleNumber, setVehicleNumber] = useState("");
	const [type, setType] = useState("AC");
	const [totalSeats, setTotalSeats] = useState(32);
	const [operator, setOperator] = useState("");
	const [imageFile, setImageFile] = useState(null);
	const [error, setError] = useState("");
	const [loading, setLoading] = useState(true);

	const load = async () => {
		setLoading(true);
		setError("");
		try {
			const data = await getBuses();
			setBuses(data);
		} catch (err) {
			setError(err?.response?.data?.message || err.message || "Failed to load buses");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
	}, []);

	const onCreate = async (e) => {
		e.preventDefault();
		setError("");
		try {
			const fd = new FormData();
			fd.append("name", name);
			if (vehicleNumber) fd.append("vehicleNumber", vehicleNumber);
			fd.append("type", type);
			fd.append("totalSeats", String(Number(totalSeats)));
			if (operator) fd.append("operator", operator);
			if (imageFile) fd.append("image", imageFile);
			await createBus(fd);
			setName("");
			setVehicleNumber("");
			setOperator("");
			setImageFile(null);
			await load();
		} catch (err) {
			setError(err?.response?.data?.message || err.message || "Create failed");
		}
	};

	return (
		<div className="mx-auto max-w-6xl px-4 py-10">
			<div className="flex items-end justify-between gap-4">
				<div>
					<h2 className="text-2xl font-extrabold text-slate-900">Manage Buses</h2>
					<p className="mt-1 text-sm text-slate-600">Add buses with an image so they look great in search & booking.</p>
				</div>
			</div>

			{error ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

			<div className="mt-6 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm sm:p-6">
				<form onSubmit={onCreate} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
					<div className="lg:col-span-2">
						<label className="block text-sm font-medium text-slate-700">Bus name</label>
						<input
							value={name}
							onChange={(e) => setName(e.target.value)}
							required
							placeholder="e.g., Sundar Bihani AC Sofa Sleeper"
							className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-slate-700">Vehicle number</label>
						<input
							value={vehicleNumber}
							onChange={(e) => setVehicleNumber(e.target.value)}
							placeholder="e.g., DL 01 AB 1234"
							className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-slate-700">Type</label>
						<select
							value={type}
							onChange={(e) => setType(e.target.value)}
							className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
						>
							<option value="AC">AC</option>
							<option value="Non-AC">Non-AC</option>
							<option value="Sleeper">Sleeper</option>
						</select>
					</div>
					<div>
						<label className="block text-sm font-medium text-slate-700">Total seats</label>
						<input
							type="number"
							min={1}
							value={totalSeats}
							onChange={(e) => setTotalSeats(e.target.value)}
							className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-slate-700">Operator ID (optional)</label>
						<input
							value={operator}
							onChange={(e) => setOperator(e.target.value)}
							placeholder="Mongo ObjectId"
							className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-900 shadow-sm outline-none focus:border-slate-300 focus:ring-2 focus:ring-slate-200"
						/>
					</div>
					<div className="sm:col-span-2 lg:col-span-3">
						<label className="block text-sm font-medium text-slate-700">Bus image</label>
						<input
							type="file"
							accept="image/*"
							onChange={(e) => setImageFile(e.target.files?.[0] || null)}
							className="mt-2 block w-full text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-slate-100 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-700 hover:file:bg-slate-200"
						/>
						<p className="mt-2 text-xs text-slate-500">Uploads to the backend and displays in search & booking.</p>
					</div>
					<div className="sm:col-span-2 lg:col-span-2">
						<button
							type="submit"
							className="inline-flex w-full items-center justify-center rounded-xl bg-orange-400 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-500"
						>
							Add bus
						</button>
					</div>
				</form>
			</div>

			<div className="mt-8">
				{loading ? <div className="text-sm text-slate-600">Loading...</div> : null}
				<div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{buses.map((b) => (
						<div key={b._id} className="overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-sm">
							<div className="aspect-video w-full bg-slate-100">
								{b.imageUrl ? (
									<img
										src={toAbsoluteAssetUrl(b.imageUrl)}
										alt={b.name}
										className="h-full w-full object-cover"
									/>
								) : (
									<div className="flex h-full w-full items-center justify-center text-sm text-slate-500">No image</div>
								)}
							</div>
							<div className="p-4">
								<div className="text-base font-extrabold text-slate-900">{b.name}</div>
								<div className="mt-2 flex flex-wrap gap-2 text-xs">
									<span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-700">{b.type || "Bus"}</span>
									<span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-700">{b.totalSeats} seats</span>
									{b.vehicleNumber ? (
										<span className="rounded-full bg-slate-100 px-2 py-1 font-medium text-slate-700">{b.vehicleNumber}</span>
									) : null}
								</div>
								<div className="mt-3 text-xs text-slate-600">Operator: {b.operator?.email || b.operator || "(none)"}</div>
							</div>
						</div>
					))}
					{buses.length === 0 && !loading ? <div className="text-sm text-slate-600">No buses.</div> : null}
				</div>
			</div>
		</div>
	);
}
